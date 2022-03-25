// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../../interfaces/common/boost/IVeWant.sol";

interface IVeWantStaking {
    function joe() external returns (IERC20Upgradeable);
    function veJoe() external returns (IVeWant);
    function claim() external;
    function deposit(uint256 _amount) external;
    function withdraw(uint256 _amount) external;
}
