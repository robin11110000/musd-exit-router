// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IMusd {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}
interface ITroveManager {
    function redeemCollateral(uint256, address, address, address, uint256, uint256) external;
}

/// @notice Atomic redemption adapter. Never pre-deposit funds here.
/// @dev Based on TrovePilot's caller-funded custody and balance-delta forwarding design.
/// Upstream: VitalR/mezo-trovepilot @ 08eeaeb. Copyright (c) 2025 Vital R.
/// Full upstream MIT notice: THIRD_PARTY_NOTICES.md.
contract BoundedRedemptionRouter {
    IMusd public immutable musd;
    ITroveManager public immutable troveManager;
    uint256 private entered;
    struct Request {
        uint256 amount;
        uint256 minBtcOut;
        uint256 minMusdRedeemed;
        uint256 deadline;
        address payable recipient;
        address firstHint;
        address upperHint;
        address lowerHint;
        uint256 partialNICR;
        uint256 maxIterations;
    }
    error InvalidRequest();
    error Expired();
    error Reentrancy();
    error TransferFailed();
    error UnsupportedToken();
    error OutputBelowMinimum();
    event Redeemed(address indexed caller, address indexed recipient, uint256 musdSpent, uint256 musdRefund, uint256 btcOut);

    constructor(address token, address manager) {
        if (token.code.length == 0 || manager.code.length == 0) revert InvalidRequest();
        musd = IMusd(token);
        troveManager = ITroveManager(manager);
    }
    modifier lock() {
        if (entered != 0) revert Reentrancy();
        entered = 1;
        _;
        entered = 0;
    }
    function redeem(Request calldata r) external lock returns (uint256 btcOut, uint256 spent, uint256 refund) {
        if (block.timestamp > r.deadline) revert Expired();
        if (r.amount == 0 || r.minBtcOut == 0 || r.minMusdRedeemed == 0 ||
            r.minMusdRedeemed > r.amount || r.recipient == address(0) ||
            r.recipient == address(this) || r.maxIterations == 0 || r.maxIterations > 100) revert InvalidRequest();
        uint256 beforeMusd = musd.balanceOf(address(this));
        uint256 beforeBtc = address(this).balance;
        _tokenCall(abi.encodeCall(IMusd.transferFrom, (msg.sender, address(this), r.amount)));
        if (musd.balanceOf(address(this)) != beforeMusd + r.amount) revert UnsupportedToken();
        troveManager.redeemCollateral(r.amount, r.firstHint, r.upperHint, r.lowerHint, r.partialNICR, r.maxIterations);
        uint256 afterMusd = musd.balanceOf(address(this));
        if (afterMusd < beforeMusd || afterMusd > beforeMusd + r.amount || address(this).balance < beforeBtc) revert UnsupportedToken();
        refund = afterMusd - beforeMusd;
        spent = r.amount - refund;
        btcOut = address(this).balance - beforeBtc;
        if (btcOut < r.minBtcOut || spent < r.minMusdRedeemed) revert OutputBelowMinimum();
        // Refund always goes to the payer, even when BTC goes to another recipient.
        if (refund != 0) _tokenCall(abi.encodeCall(IMusd.transfer, (msg.sender, refund)));
        (bool ok,) = r.recipient.call{value: btcOut}("");
        if (!ok) revert TransferFailed();
        emit Redeemed(msg.sender, r.recipient, spent, refund, btcOut);
    }
    function _tokenCall(bytes memory data) private {
        (bool ok, bytes memory result) = address(musd).call(data);
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }
    // Mezo's ActivePool sends collateral on behalf of TroveManager.
    // Balance deltas exclude any BTC received before this execution.
    receive() external payable {}
}
