// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "../../interfaces/common/boost/IVeWant.sol";
import "../../interfaces/traderjoe/IBoostedMasterChef.sol";
import "../../interfaces/traderjoe/IVeWantStaking.sol";
import "./VeJoeStakingManager.sol";

contract VeJoeStaker is ERC20Upgradeable, ReentrancyGuardUpgradeable, VeJoeStakingManager {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    // Tokens used
    IERC20Upgradeable public want;
    IVeWant public veWant;

    event DepositWant(uint256 tvl);
    event RecoverTokens(address token, uint256 amount);

    function initialize(
        address _veWantStaking,
        address _keeper,
        address _chef,
        string memory _name,
        string memory _symbol
    ) public initializer {
        managerInitialize(_veWantStaking, _keeper, _chef);

        veWant = IVeWantStaking(_veWantStaking).veJoe();
        want = IVeWantStaking(_veWantStaking).joe();

        __ERC20_init(_name, _symbol);

        want.safeApprove(address(veWant), type(uint256).max);
    }

    // helper function for depositing full balance of want
    function depositAll() external {
        _deposit(msg.sender, want.balanceOf(msg.sender));
    }

    // deposit an amount of want
    function deposit(uint256 _amount) external {
        _deposit(msg.sender, _amount);
    }

    // deposit an amount of want on behalf of an address
    function depositFor(address _user, uint256 _amount) external {
        _deposit(_user, _amount);
    }

    // deposit 'want' 
    // TODO
    function _deposit(address _user, uint256 _amount) internal nonReentrant whenNotPaused {
        uint256 _pool = balanceOfWant();
        want.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 _after = balanceOfWant();
        _amount = _after.sub(_pool); // Additional check for deflationary tokens
        if (_amount > 0) {
            // TODO figure out how to stak

            _mint(_user, _amount);
            emit DepositWant(balanceOfVe());
        }
    }

    // calculate how much 'want' is held by this contract
    function balanceOfWant() public view returns (uint256) {
        return want.balanceOf(address(this));
    }

    // calculate how much 'veWant' is held by this contract
    function balanceOfVe() public view returns (uint256) {
        return veWant.balanceOf(address(this));
    }

    // prevent any further 'want' deposits and remove approval
    function pause() public onlyManager {
        _pause();
        want.safeApprove(address(veWant), 0);
    }

    // allow 'want' deposits again and reinstate approval
    function unpause() external onlyManager {
        _unpause();
        want.safeApprove(address(veWant), type(uint256).max);
    }

    // pass through a deposit to the chef
    function deposit(uint256 _poolId, uint256 _amount) external onlyWhitelist(_poolId) {
        address _underlying = _wantFromPool(_poolId);
        IERC20Upgradeable(_underlying).safeTransferFrom(msg.sender, address(this), _amount);
        IBoostedMasterChef(chef).deposit(_poolId, _amount);
    }

    // pass through a withdrawal from the chef
    function withdraw(uint256 _poolId, uint256 _amount) external onlyWhitelist(_poolId) {
        address _underlying = _wantFromPool(_poolId);
        _withdraw(_poolId, _underlying, _amount);
    }

    // pass through a full withdrawal from the chef
    function withdrawAll(uint256 _poolId) external onlyWhitelist(_poolId) {
        address _underlying = _wantFromPool(_poolId);
        (uint256 _amount,,) = IBoostedMasterChef(chef).userInfo(_poolId, address(this));
        _withdraw(_poolId, _underlying, _amount);
    }

    // pass through rewards from the chef
    function claimWantReward(uint256 _poolId) external onlyWhitelist(_poolId) {
        _withdraw(_poolId, address(0), 0);
    }

    // recover any unknown tokens
    function inCaseTokensGetStuck(address _token) external onlyOwner {
        require(_token != address(want), "!token");

        uint256 _amount = IERC20Upgradeable(_token).balanceOf(address(this));
        IERC20Upgradeable(_token).safeTransfer(msg.sender, _amount);

        emit RecoverTokens(_token, _amount);
    }

    // internal withdrawal function
    function _withdraw(uint256 _poolId, address _underlying, uint256 _amount) internal {
        uint256 _before = balanceOfWant();
        IBoostedMasterChef(chef).withdraw(_poolId, _amount);
        uint256 _balance = balanceOfWant().sub(_before);
        want.safeTransfer(msg.sender, _balance);
        if( _balance > 0) {
            IERC20Upgradeable(_underlying).safeTransfer(msg.sender, _balance);
        }
    }

    // get want from chef pool
    function _wantFromPool(uint256 _poolId) internal view returns (address) {
        (address _want,,,) = IBoostedMasterChef(chef).poolInfo(_poolId);
        return _want;
    }
}
