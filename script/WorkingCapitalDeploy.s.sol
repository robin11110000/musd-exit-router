// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Script.sol";
import {WorkingCapitalVault} from "../src/WorkingCapitalVault.sol";

/// @notice Deploys an unfunded, inactive, single-owner vault on Mezo testnet.
contract WorkingCapitalDeploy is Script {
    function run() external returns (WorkingCapitalVault vault) {
        require(block.chainid == 31611, "Mezo testnet only");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envOr("VAULT_OWNER", vm.addr(key));
        vm.startBroadcast(key);
        vault = new WorkingCapitalVault(
            0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503,
            0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16,
            owner
        );
        vm.stopBroadcast();
        console2.log("Inactive working-capital vault", address(vault));
        console2.log("Owner", owner);
    }
}
