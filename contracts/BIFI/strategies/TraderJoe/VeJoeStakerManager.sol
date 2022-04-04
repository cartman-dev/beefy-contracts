// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../../interfaces/beefy/IVault.sol";
import "../../interfaces/common/boost/IBoostedStrategy.sol";
import "../../interfaces/traderjoe/IVeWantStaking.sol";
import "../../interfaces/traderjoe/IBoostedMasterChef.sol";

import "hardhat/console.sol";

contract VeJoeStakerManager is Initializable, OwnableUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @dev Beefy Contracts:
     * {joeVault} - Single-stake vault for JOE reserves
     * {veWantStaking} - Address of the staking contract for veWant.
     * {keeper} - Address to manage a few lower risk features of the strat.
     * {chef} - Address for the chef managing the boosted pools.
     */
    address public joeVault;
    address public keeper;

    /**
     * @dev 3rd Party Contracts:
     * {veWantStaking} - StakingProxy for veJOE
     * {chef} - BoostedMasterChef
      */
    IVeWantStaking public veWantStaking;
    IBoostedMasterChef public chef;

    /**
     * @dev Staker Parameters
     * {whitelistedStrategy} - Mapping of whitelisted strategy addresses
     *                         from poolIds
     * {replacementStrategy} - Mapping current strategy to replacement strategy
     */
    mapping(uint256 => address) public whitelistedStrategy;
    mapping(address => address) public replacementStrategy;

    /**
     * @dev Reserve Parameters
     */
    uint256 constant public MAX_REWARDER_RATE = 5000;
    uint256 constant public MIN_RESERVE_RATIO_BPS = 500;
    uint256 constant public BATCH_SIZE_BPS = 500;
    uint256 public reserveRatioBps = MIN_RESERVE_RATIO_BPS;

    mapping(uint256 => address) public rewarders;
    mapping(uint256 => uint256) public rewardRates;

    /**
     * @dev Initializes the base strategy.
     * @param _veWantStaking address of the staking contract for veWant.
     * @param _keeper address to manage a few lower risk features of the strat.
     * @param _chef address for the chef managing the boosted pools.
     */
    function managerInitialize(
        address _veWantStaking,
        address _keeper,
        address _chef
    ) internal initializer {
        __Ownable_init();

        veWantStaking = IVeWantStaking(_veWantStaking);
        keeper = _keeper;
        chef = IBoostedMasterChef(_chef);
    }

    // checks that caller is either owner or keeper.
    modifier onlyManager() {
        require(msg.sender == owner() || msg.sender == keeper, "!manager");
        _;
    }

    // checks that caller is the strategy assigned to a specific gauge.
    modifier onlyWhitelist(uint256 _poolId) {
        require(whitelistedStrategy[_poolId] == msg.sender, "!whitelisted");
        _;
    }

    /**
     * @dev Updates address of the chef.
     * @param _chef new chef.
     */
    function setChef(address _chef) external onlyOwner {
        chef = IBoostedMasterChef(_chef);
    }

    /**
     * @dev Updates address of the strat keeper.
     * @param _keeper new keeper address.
     */
    function setKeeper(address _keeper) external onlyManager {
        keeper = _keeper;
    }

    /**
     * @dev Whitelists a strategy address to interact with the VeJoeStaker and gives approvals.
     * @param _strategy new strategy address.
     */
    function whitelistStrategy(address _strategy) external onlyManager {
        IERC20Upgradeable _want = IBoostedStrategy(_strategy).want();
        uint256 _poolId = IBoostedStrategy(_strategy).poolId();
        (uint256 _amount,,) = chef.userInfo(_poolId, address(this));
        require(_amount == 0, "!inactive");

        _want.safeApprove(address(chef), 0);
        _want.safeApprove(address(chef), type(uint256).max);
        whitelistedStrategy[_poolId] = _strategy;
    }

    /**
     * @dev Removes a strategy address from the whitelist and remove approvals.
     * @param _strategy remove strategy address from whitelist.
     */
    function blacklistStrategy(address _strategy) external onlyManager {
        IERC20Upgradeable _want = IBoostedStrategy(_strategy).want();
        uint256 _poolId = IBoostedStrategy(_strategy).poolId();
        _want.safeApprove(address(chef), 0);
        whitelistedStrategy[_poolId] = address(0);
    }

    /**
     * @dev Prepare a strategy to be retired and replaced with another.
     * @param _oldStrategy strategy to be replaced.
     * @param _newStrategy strategy to be implemented.
     */
    function proposeStrategy(address _oldStrategy, address _newStrategy) external onlyManager {
        require(IBoostedStrategy(_oldStrategy).poolId() == IBoostedStrategy(_newStrategy).poolId(), '!poolId');
        require(IBoostedStrategy(_oldStrategy).chef() == IBoostedStrategy(_newStrategy).chef(), '!chef');
        replacementStrategy[_oldStrategy] = _newStrategy;
    }

    /**
     * @dev Switch over whitelist from one strategy to another for a pool.
     * @param _poolId Chef poolId for which the new strategy will be whitelisted.
     */
    function upgradeStrategy(uint256 _poolId) external onlyWhitelist(_poolId) {
        whitelistedStrategy[_poolId] = replacementStrategy[msg.sender];
    }

    function setRewarder(uint256 _id, address _rewarder, _rate) external onlyOwner {
        require(_rate <= MAX_REWARDER_RATE, "!Rate");
        rewarders[_id] = _rewarder;
        rewardRates[_id] = _rate;
    }

    function setReserveRate(uint256 _rate) external onlyOwner {
        require(_ratio >= MIN_RESERVE_RATE_BPS, "! >Min");
        reserveRateBps = _rate;
    }

    function _reserveJoeBal() internal returns (uint256) {
        return balanceOfWant()
            .add(IVault(joeVault).balance());
    }

    function _totalJoeBal() internal returns (uint256) {
        return _reserveJoeBal()
            .add(veWantStaking.joe());
    }

    function _targetJoeBal() internal returns (uint256) {
        return _wantJoeBal()
            .mul(reserveRateBps)
            .div(10000);
    }

    function _batchAmount(uint256) internal returns (uint256) {
        uint256 toLock = _targetJoeBal().sub(_totalJoeBal());
        uint256 batchSize = veWantStaking.joe().mul(BATCH_SIZE_BPS).div(10000);

        if (toLock < batchSize) {
            return 0;
        }

        return batchSize;
    }
}