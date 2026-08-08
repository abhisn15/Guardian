require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ quiet: true });

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Pinned explicitly: the deployed bytecode was compiled with evmVersion
      // "paris" (see artifacts/build-info). Changing this breaks verification.
      evmVersion: "paris",
    },
  },
  networks: {
    monadTestnet: {
      url: "https://testnet-rpc.monad.xyz",
      chainId: 10143,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  // MonadVision / Monad Explorer verification goes through Sourcify.
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify-api-monad.blockvision.org",
    browserUrl: "https://testnet.monadexplorer.com",
  },
  // Monadscan (Etherscan v2) only works with an API key; enable it when one
  // is present so a missing key never blocks the Sourcify path.
  etherscan: {
    enabled: Boolean(ETHERSCAN_API_KEY),
    apiKey: {
      monadTestnet: ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "monadTestnet",
        chainId: 10143,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=10143",
          browserURL: "https://testnet.monadscan.com",
        },
      },
    ],
  },
};
