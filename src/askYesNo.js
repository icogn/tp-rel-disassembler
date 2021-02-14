'use strict';

const readline = require('readline');

/**
 * Asks a yes/no question.
 *
 * @param {string} question Question to ask
 * @param {function} answerCallback Callback which is passed the user's answer
 * to the question and should return true for yes and false for no.
 * @returns {boolean} true if yes, false if no
 */
async function askYesNo(question, answerCallback) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} `, async (answer) => {
      rl.close();

      answer = answer.trim().toLowerCase();
      resolve(Boolean(answerCallback(answer)));
    });
  });
}

module.exports = askYesNo;
