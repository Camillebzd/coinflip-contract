import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "";

// Etherlink testnet
const ETHERLINK_TESTNET_RPC_URL =
  process.env.ETHERLINK_TESTNET_RPC_URL ||
  "https://node.ghostnet.etherlink.com";
const ETHERLINK_TESTNET_API_KEY =
  process.env.ETHERLINK_TESTNET_API_KEY ||
  "";

// Etherlink
const ETHERLINK_RPC_URL =
  process.env.ETHERLINK_RPC_URL ||
  "https://node.mainnet.etherlink.com";
const ETHERLINK_API_KEY =
  process.env.ETHERLINK_API_KEY ||
  "";

// Monad testnet
const MONAD_TESTNET_RPC_URL =
  process.env.MONAD_TESTNET_RPC_URL ||
  "https://testnet-rpc.monad.xyz";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        // eslint-disable-next-line
        enabled: true,
        url: ETHERLINK_TESTNET_RPC_URL,
      },
      // chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545/",
      chainId: 31337
    },
    etherlinkTestnet: {
      chainId: 128123,
      url: ETHERLINK_TESTNET_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
    etherlink: {
      chainId: 42793,
      url: ETHERLINK_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
    monadTestnet: {
      chainId: 10143,
      url: MONAD_TESTNET_RPC_URL,
      accounts: [PRIVATE_KEY],
    }
  },
  // if you want to verify contracts on Monad
  // sourcify: {
  //   enabled: true,
  //   apiUrl: "https://sourcify-api-monad.blockvision.org",
  //   browserUrl: "https://testnet.monadexplorer.com/"
  // },
  // etherscan: {
  //     enabled: false,
  // },
  // if you want to verify contracts on Etherlink
  etherscan: {
    apiKey: {
      etherlinkTestnet: ETHERLINK_TESTNET_API_KEY,
      etherlink: ETHERLINK_API_KEY
    },
    customChains: [
      {
        network: "etherlinkTestnet",
        chainId: 128123,
        urls: {
          apiURL: "https://testnet.explorer.etherlink.com/api",
          browserURL: "https://testnet.explorer.etherlink.com"
        }
      },
      {
        network: "etherlink",
        chainId: 42793,
        urls: {
          apiURL: "	https://explorer.etherlink.com/api",
          browserURL: "	https://explorer.etherlink.com"
        }
      }
    ]
  }
};

export default config;
