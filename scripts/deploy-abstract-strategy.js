const hardhat = require("hardhat");

const ethers = hardhat.ethers;

const strategyName = "StrategyCommonMinichefLP";

async function main() {
  await hardhat.run("compile");

  const AbstractStrategyFactory = await ethers.getContractFactory(strategyName);

  console.log("Deploying: ", strategyName);

  const AbstractStrategy = await AbstractStrategyFactory.deploy();
  await AbstractStrategy.deployed();

  console.log(strategyName, AbstractStrategy.address);

  await hardhat.run("verify:verify", {
    address: AbstractStrategy.address,
    constructorArguments: [],
  });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
