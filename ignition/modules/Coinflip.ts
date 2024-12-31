// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const RouletteModule = buildModule("RouletteModule", (m) => {
  const Entropy = "0x23f0e8FAeE7bbb405E7A7C3d60138FCfd43d7509";

  const roulette = m.contract("Roulette", [Entropy]);

  return { roulette };
});

export default RouletteModule;