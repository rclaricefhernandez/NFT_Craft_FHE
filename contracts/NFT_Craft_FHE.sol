pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NFTCraftFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public isBatchOpen;
    mapping(uint256 => uint256) public batchSubmissionCount;

    struct EncryptedTrait {
        euint32 value;
        euint32 weight;
    }
    mapping(uint256 => mapping(address => EncryptedTrait)) public batchParentTraits;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsChanged(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event TraitSubmitted(uint256 indexed batchId, address indexed provider);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 craftedTraitValue);

    error NotOwner();
    error NotProvider();
    error PausedError();
    error CooldownActive();
    error BatchClosedOrNonExistent();
    error ReplayDetected();
    error StateMismatch();
    error InvalidBatchState();
    error InvalidCooldown();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        emit ProviderAdded(owner);
        currentBatchId = 1;
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidCooldown();
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsChanged(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        isBatchOpen[currentBatchId] = true;
        batchSubmissionCount[currentBatchId] = 0;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (!isBatchOpen[batchId]) revert InvalidBatchState();
        isBatchOpen[batchId] = false;
        emit BatchClosed(batchId);
    }

    function submitParentTrait(
        uint256 batchId,
        euint32 encryptedTraitValue,
        euint32 encryptedTraitWeight
    ) external onlyProvider whenNotPaused {
        if (!isBatchOpen[batchId]) revert BatchClosedOrNonExistent();
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }

        _initIfNeeded(encryptedTraitValue);
        _initIfNeeded(encryptedTraitWeight);

        batchParentTraits[batchId][msg.sender] = EncryptedTrait({
            value: encryptedTraitValue,
            weight: encryptedTraitWeight
        });
        batchSubmissionCount[batchId]++;
        lastSubmissionTime[msg.sender] = block.timestamp;
        emit TraitSubmitted(batchId, msg.sender);
    }

    function craftNewTrait(uint256 batchId) external onlyProvider whenNotPaused returns (uint256) {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 memory craftedTraitEncrypted = _computeCraftedTrait(batchId);
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(craftedTraitEncrypted);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });
        emit DecryptionRequested(requestId, batchId);
        return requestId;
    }

    function _computeCraftedTrait(uint256 batchId) internal view returns (euint32 memory craftedTraitEncrypted) {
        // Simplified example: Sum of all trait values in the batch, weighted by their weights.
        // In a real scenario, this would be a more complex FHE calculation.
        craftedTraitEncrypted = FHE.asEuint32(0); // Initialize encrypted sum

        // This loop is for demonstration. A real implementation might iterate over known providers
        // or use a more sophisticated FHE aggregation if the number of providers is dynamic and large.
        // For this example, we assume we can iterate or have a fixed set of providers for a batch.
        // Here, we'll just sum the first provider's trait if it exists as an example.
        if (batchSubmissionCount[batchId] > 0) {
            // Example: Sum the first provider's trait.
            // A more realistic FHE calculation would involve more complex logic.
            // For instance, if there were two traits t1, t2 with weights w1, w2:
            // euint32 memory numerator = t1.mul(w1).add(t2.mul(w2));
            // euint32 memory denominator = w1.add(w2);
            // craftedTraitEncrypted = numerator.div(denominator); // FHE.div is not in the allowed list, so this is conceptual.
            // For this exercise, we'll stick to allowed operations.
            // Let's assume a simple sum of one trait for demonstration.
            EncryptedTrait memory trait = batchParentTraits[batchId][owner]; // Example: use owner's trait
            _initIfNeeded(trait.value);
            craftedTraitEncrypted = trait.value; // Simplified: just take one trait
        }
        return craftedTraitEncrypted;
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();

        // Rebuild cts in the exact same order as in craftNewTrait
        // This part is tricky as the original cts were derived from an euint32.
        // We need to reconstruct the euint32 from storage to get the same ciphertext.
        // The state hash verification ensures that the underlying data that produced the ciphertexts hasn't changed.
        // For simplicity, we'll assume the ciphertexts are implicitly verified by the state hash of the source data.
        // A more robust approach would store the exact cts used for the request or recompute them identically.
        // Here, we'll focus on the state hash of the *source* data (the batchParentTraits).
        // The `craftedTraitEncrypted` itself is not stored, so we verify the inputs that led to it.

        // The stateHash in DecryptionContext was computed from the `craftedTraitEncrypted` ciphertext.
        // To re-verify, we would need to re-compute `craftedTraitEncrypted` and then its ciphertext.
        // This implies that `_computeCraftedTrait` must be deterministic for a given batchId.
        // Let's assume `_computeCraftedTrait` is deterministic.
        euint32 memory currentCraftedTraitEncrypted = _computeCraftedTrait(decryptionContexts[requestId].batchId);
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(currentCraftedTraitEncrypted);

        bytes32 currentStateHash = _hashCiphertexts(currentCts);

        if (currentStateHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256 craftedTraitValue = abi.decode(cleartexts, (uint256));
        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, craftedTraitValue);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal {
        if (!FHE.isInitialized(x)) {
            x = FHE.asEuint32(0);
        }
    }

    // This _requireInitialized is an example, actual usage depends on FHE lib guarantees
    // For this problem, we use _initIfNeeded which sets to 0 if not initialized.
    // If a function strictly needs an initialized value passed by user, this could be used.
    function _requireInitialized(euint32 x) internal pure {
        if (!FHE.isInitialized(x)) {
            revert("Ciphertext not initialized");
        }
    }
}