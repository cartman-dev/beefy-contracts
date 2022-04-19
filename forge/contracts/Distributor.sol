// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin-4/contracts/token/ERC20/utils/SafeERC20.sol";

contract Distributor {
    using SafeERC20 for IERC20;

    address public wNative;

    address public receiverA;
    address public receiverB;

    constructor(
        address _wNative,
        address _receiverA, 
        address _receiverB
    ) {
        wNative = _wNative;
        receiverA = _receiverA;
        receiverB = _receiverB;
    }

    function want() public view returns (address) {
        return wNative;
    }

    function available() public view returns (uint256) {
        return IERC20(wNative).balanceOf(address(this));
    }

    function distribute() public {
        _distribute(wNative, available() / 2);
    }

    function rescue(address _token) public {
        uint256 halfBal = IERC20(_token).balanceOf(address(this)) / 2;
        _distribute(_token, halfBal);
    }

    function _distribute(address _token, uint256 _amount) internal {
        IERC20(_token).safeTransfer(receiverA, _amount);
        IERC20(_token).safeTransfer(receiverB, _amount);
    }

    function updateReceiver(address _receiver) external {
        if (msg.sender == receiverA) {
            receiverA = _receiver;
            return;
        }
        
        if (msg.sender == receiverB) {
            receiverB = _receiver;
            return;
        }

        revert("!receiver");
    }
}