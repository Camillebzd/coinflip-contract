// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { network } from "hardhat";

const CoinflipModule = buildModule("CoinflipModule", (m) => {
  let Entropy: string;

  switch (network.name) {
    case "etherlink":
    case "etherlinkTestnet":
      Entropy = "0x23f0e8FAeE7bbb405E7A7C3d60138FCfd43d7509";
      break;
    case "monad":
    case "monadTestnet":
      Entropy = "0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320";
      break;
    default:
      throw new Error("Unsupported network: " + network.name);
    }

  const coinflip = m.contract("Coinflip", [Entropy]);

  return { coinflip };
});

export default CoinflipModule;
