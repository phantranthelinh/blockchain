const SHA256 = require("crypto-js/sha256");
const DIFFICULTY = 2;
const currentNodeUrl = process.argv[3];
const { v4: uuidv4 } = require("uuid");

class Blockchain {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];
    this.currentNodeUrl = currentNodeUrl;
    this.networkNodes = [];
    this.createNewBlock(0, "root", "0");
  }
  createNewBlock(nonce, prevHash, hash) {
    const newBlock = {
      index: this.chain.length + 1,
      timestamp: Date.now(),
      hash: hash,
      prevHash: prevHash,
      nonce: nonce,
      transactions: this.pendingTransactions,
    };
    this.chain.push(newBlock);
    this.pendingTransactions = [];
    return newBlock;
  }
  getLastBlock() {
    return this.chain[this.chain.length - 1];
  }
  createNewTransaction(amount, sender, recipient) {
    const newTransaction = {
      amount: amount,
      sender: sender,
      recipient: recipient,
      transactionId: uuidv4().split("-").join(""),
    };
    return newTransaction;
  }
  addTransactionToPendingTransactions(newTransaction) {
    this.pendingTransactions.push(newTransaction);
    return this.getLastBlock().index + 1;
  }
  generateHash(prevHash, currentBlockData, nonce) {
    const dataAsString =
      prevHash + nonce.toString() + JSON.stringify(currentBlockData);
    const hash = SHA256(dataAsString).toString();
    return hash;
  }
  proofOfWork(prevHash, currentBlockData) {
    let nonce = 0;
    let hash = "";
    //TODO: Generate hash starts with DIFFICULTY zeros
    while (hash.slice(0, DIFFICULTY) !== "0".repeat(DIFFICULTY)) {
      nonce++;
      hash = this.generateHash(prevHash, currentBlockData, nonce);
    }
    return nonce;
  }
  chainIsValid(blockchain) {
    let validChain = true;
    for (var i = 1; i < blockchain.length; i++) {
      const currentBlock = blockchain[i];
      const prevBlock = blockchain[i - 1];
      const currentBlockData = {
        transactions: currentBlock.transactions,
        index: currentBlock.index,
      };
      const blockHash = this.generateHash(
        prevBlock.hash,
        currentBlockData,
        currentBlock.nonce
      );
      if (blockHash.slice(0, DIFFICULTY) !== "0".repeat(DIFFICULTY))
        validChain = false;
      if (prevBlock.hash !== currentBlock.prevHash) validChain = false;
    }

    const genesisBlock = blockchain[0];
    const correctNonce = genesisBlock.nonce === 0;
    const correctPrevBlockHash = genesisBlock.prevHash === "root";
    const correctHash = genesisBlock.hash === "0";
    const correctTransactions = genesisBlock.transactions.length === 0;

    if (
      !correctNonce ||
      !correctPrevBlockHash ||
      !correctHash ||
      !correctTransactions
    )
      validChain = false;

    return validChain;
  }

  getBlock(blockHash) {
    return this.chain.find((block) => block.hash === blockHash);
  }
  getTransaction(transactionId) {
    let correctTransaction = null;
    let correctBlock = null;
    this.chain.forEach((block) =>
      block.transactions.forEach((transaction) => {
        if (transaction.transactionId === transactionId) {
          correctTransaction = transaction;
          correctBlock = block;
        }
      })
    );
    return { block: correctBlock, transaction: correctTransaction };
  }

  getAddressData(address) {
    const addressTransactions = [];

    this.chain.forEach((block) => {
      block.transactions.forEach((transaction) => {
        if (
          transaction.sender === address ||
          transaction.recipient === address
        ) {
          addressTransactions.push(transaction);
        }
      });
    });

    let balance = 0;
    addressTransactions.forEach((transaction) => {
      if (transaction.recipient === address) balance += transaction.amount;
      if (transaction.sender === address) balance -= transaction.amount;
    });

    return { addressTransactions, balance };
  }
}

module.exports = Blockchain;
