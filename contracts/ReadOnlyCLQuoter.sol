// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
interface ICLPool {
    function swap(address,bool,int256,uint160,bytes calldata) external returns(int256,int256);
}
/// @dev Research tool injected with eth_call state overrides; never deploys or pays.
contract ReadOnlyCLQuoter {
    error Quote(uint256 amountOut,uint256 amountIn);
    function quote(address pool,bool zeroForOne,uint256 amount) external returns(uint256 amountOut,uint256 amountIn) {
        try ICLPool(pool).swap(address(this),zeroForOne,int256(amount),zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341,"") {
            revert("unexpected success");
        } catch(bytes memory reason) {
            if(reason.length != 68 || bytes4(reason) != Quote.selector) {
                assembly { revert(add(reason,32),mload(reason)) }
            }
            assembly {
                amountOut := mload(add(reason,36))
                amountIn := mload(add(reason,68))
            }
        }
    }
    function uniswapV3SwapCallback(int256 amount0,int256 amount1,bytes calldata) external pure {
        if(amount0 < 0 && amount1 > 0) revert Quote(uint256(-amount0),uint256(amount1));
        if(amount1 < 0 && amount0 > 0) revert Quote(uint256(-amount1),uint256(amount0));
        revert("no output");
    }
}
