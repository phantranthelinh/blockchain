const express = require("express");
const bodyParser = require("body-parser");
const Blockchain = require("./blockchain");
const { v4: uuidv4 } = require("uuid");
const rp = require("request-promise");

const app = express();
const hasucoin = new Blockchain();
const nodeAddress = uuidv4().split("-").join("");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//TODO: fetch entire blockchain
app.get("/blockchain", (req, res) => {
  res.send(hasucoin);
});

//TODO: create new transaction
app.post("/transaction", (req, res) => {
  const newTransaction = req.body;
  const blockIndex = hasucoin.addTransactionToPendingTransactions({
    ...newTransaction,
    transactionId: nodeAddress,
  });
  res.status(200).json({
    message: `Transaction will be added in block index ${blockIndex}`,
  });
});

//TODO: create new transaction
app.post("/transaction/broadcast", (req, res) => {
  const { amount, sender, recipient } = req.body;
  const newTransaction = hasucoin.createNewTransaction(
    amount,
    sender,
    recipient
  );
  hasucoin.addTransactionToPendingTransactions(newTransaction);

  const requestPromises = [];
  hasucoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + "/transaction",
      method: "POST",
      body: {
        newTransaction,
      },
      json: true,
    };
    requestPromises.push(rp(requestOptions));
  });

  Promise.all(requestPromises).then(() => {
    res.status(200).json({
      message: "Transaction created and broadcast successfully",
    });
  });
});

//TODO: mining new block
app.get("/mine", (req, res) => {
  const lastBlock = hasucoin.getLastBlock();
  const prevHash = lastBlock.hash;
  const currentBlockData = {
    index: lastBlock.index + 1,
    transaction: hasucoin.pendingTransactions,
  };
  const nonce = hasucoin.proofOfWork(prevHash, currentBlockData);
  const hash = hasucoin.generateHash(prevHash, currentBlockData, nonce);

  // blockchain.createNewTransaction(12.5, "00", nodeAddress)
  const newBlock = hasucoin.createNewBlock(nonce, prevHash, hash);

  const requestPromises = [];
  hasucoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + "/receive-new-block",
      method: "POST",
      body: { newBlock },
      json: true,
    };
    requestPromises.push(rp(requestOptions));
  });

  Promise.all(requestPromises)
    .then(() => {
      const requestOptions = {
        uri: hasucoin.currentNodeUrl + "/transaction/broadcast",
        method: "POST",
        body: {
          amount: 19,
          sender: "00",
          recipient: nodeAddress,
        },
        json: true,
      };
      return rp(requestOptions);
    })
    .then(() => {
      res.status(200).json({
        message: "New block mined and broadcast successfully",
        block: newBlock,
      });
    });
});

app.post("/receive-new-block", (req, res) => {
  const { newBlock } = req.body;
  const lastBlock = hasucoin.getLastBlock();
  const correctHash = lastBlock.hash === newBlock.prevHash;
  const correctIndex = lastBlock.index + 1 === newBlock.index;

  if (correctHash && correctIndex) {
    hasucoin.chain.push(newBlock);
    hasucoin.pendingTransactions = [];
    res.status(200).json({
      message: "New block receive and accepted",
      newBlock,
    });
  } else {
    res.status(400).json({
      message: "New block rejected",
      newBlock,
    });
  }
});
//TODO: register and broadcast it into the network
app.post("/register-and-broadcast-node", (req, res) => {
  const newNodeUrl = req.body.newNodeUrl;
  const nodeNotAlreadyPresent =
    hasucoin.networkNodes.indexOf(newNodeUrl) === -1;

  if (nodeNotAlreadyPresent) {
    hasucoin.networkNodes.push(newNodeUrl);
  }

  const regNodesPromises = [];
  hasucoin.networkNodes.forEach((networkNodeUrl) => {
    //register-node

    const requestOptions = {
      uri: networkNodeUrl + "/register-node",
      method: "POST",
      body: {
        newNodeUrl,
      },
      json: true,
    };
    regNodesPromises.push(rp(requestOptions));
  });
  Promise.all(regNodesPromises)
    .then(() => {
      const bulkRegisterOptions = {
        uri: newNodeUrl + "/register-nodes-bulk",
        method: "POST",
        body: {
          allNetworkNodes: [...hasucoin.networkNodes, hasucoin.currentNodeUrl],
        },
        json: true,
      };
      return rp(bulkRegisterOptions);
    })
    .then(() => {
      res.status(200).json({
        message: "New node registered successfully with the network",
      });
    });
});

//TODO: register a with the network
app.post("/register-node", (req, res) => {
  const newNodeUrl = req.body.newNodeUrl;
  const nodeNotAlreadyPresent =
    hasucoin.networkNodes.indexOf(newNodeUrl) === -1;
  const notCurrentNode = hasucoin.currentNodeUrl !== newNodeUrl;

  if (nodeNotAlreadyPresent && notCurrentNode)
    hasucoin.networkNodes.push(newNodeUrl);
  res.status(200).json({
    message: "New node registered successfully with node",
  });
});

//TODO: register multiple nodes at once
app.post("/register-nodes-bulk", (req, res) => {
  const allNetworkNodes = req.body.allNetworkNodes;
  allNetworkNodes.forEach((networkNodeUrl) => {
    const nodeNotAlreadyPresent =
      hasucoin.networkNodes.indexOf(networkNodeUrl) === -1;
    const notCurrentNode = hasucoin.currentNodeUrl !== networkNodeUrl;

    if (nodeNotAlreadyPresent && notCurrentNode)
      hasucoin.networkNodes.push(networkNodeUrl);
  });
  res.status(200).json({
    message: "Bulk registered successfully",
  });
});

app.get("/consensus", function (req, res) {
  const requestPromises = [];
  hasucoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + "/blockchain",
      method: "GET",
      json: true,
    };

    requestPromises.push(rp(requestOptions));
  });

  Promise.all(requestPromises).then((blockchains) => {
    const currentChainLength = hasucoin.chain.length;
    let maxChainLength = currentChainLength;
    let newLongestChain = null;
    let newPendingTransactions = null;

    blockchains.forEach((blockchain) => {
      if (blockchain.chain.length > maxChainLength) {
        maxChainLength = blockchain.chain.length;
        newLongestChain = blockchain.chain;
        newPendingTransactions = blockchain.pendingTransactions;
      }
    });

    if (
      !newLongestChain ||
      (newLongestChain && !hasucoin.chainIsValid(newLongestChain))
    ) {
      res.json({
        note: "Current chain has not been replaced.",
        chain: hasucoin.chain,
      });
    } else {
      hasucoin.chain = newLongestChain;
      hasucoin.pendingTransactions = newPendingTransactions;
      res.json({
        note: "This chain has been replaced.",
        chain: hasucoin.chain,
      });
    }
  });
});

app.get("/block/:blockHash", (req, res) => {
  const { blockHash } = req.params;
  const block = hasucoin.getBlock(blockHash);
  if (!block) {
    res.status(200).json({
      message: "Block not found",
    });
  }
  res.status(200).json({
    block,
  });
});

app.get("/transactions/:transactionId", (req, res) => {
  const { transactionId } = req.params;
  const { transaction, block } = hasucoin.getTransaction(transactionId);
  res.status(200).json({
    transaction,
    block,
  });
});

app.get("/address/:address", (req, res) => {
  const { address } = req.params;
  const { addressTransactions, balance } = hasucoin.getAddressData(address);
  res.status(200).json({
    addressTransactions,
    balance,
  });
});

app.get("/block-explorer", (req, res) => {
  res.sendFile("./block-explorer/index.html", { root: __dirname });
});

//TODO: Start the server
const PORT = process.argv[2] || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
