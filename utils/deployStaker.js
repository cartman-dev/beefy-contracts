const { ethers, upgrades } = require("hardhat");
const { getImplementationAddress } = require("@openzeppelin/upgrades-core");

const deployStaker = async config => {
  const initializerArguments = [
    config.stakerParams.veWantStaking,
    config.stakerParams.keeper,
    config.stakerParams.chef,
    config.stakerParams.name,
    config.stakerParams.symbol,
  ];

  const provider = config.signer.provider;

  const Staker = await ethers.getContractFactory(config.staker);
  const staker = await upgrades.deployProxy(Staker, [...initializerArguments]);
  await staker.deployed();

  const impl = await getImplementationAddress(provider, staker.address);

  return { impl, staker };
};

module.exports = { deployStaker };
