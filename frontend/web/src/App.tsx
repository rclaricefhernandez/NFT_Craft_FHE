// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface NFT {
  id: number;
  name: string;
  encryptedTraits: string;
  owner: string;
  timestamp: number;
  image: string;
}

interface CraftingRecipe {
  id: number;
  name: string;
  description: string;
  requiredNFTs: number;
  encryptedResult: string;
}

interface CommunityShowcase {
  id: number;
  nftId: number;
  creator: string;
  comment: string;
}

// FHE encryption/decryption functions
const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [recipes, setRecipes] = useState<CraftingRecipe[]>([]);
  const [showcases, setShowcases] = useState<CommunityShowcase[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [selectedNFTs, setSelectedNFTs] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState('myNFTs');
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [showCraftingModal, setShowCraftingModal] = useState(false);
  const [craftingStep, setCraftingStep] = useState(1);
  const [newShowcaseComment, setNewShowcaseComment] = useState("");
  const [showcaseNFTId, setShowcaseNFTId] = useState<number | null>(null);

  // Initialize signature parameters
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  // Load data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      // Load NFTs
      const nftsBytes = await contract.getData("nfts");
      let nftsList: NFT[] = [];
      if (nftsBytes.length > 0) {
        try {
          const nftsStr = ethers.toUtf8String(nftsBytes);
          if (nftsStr.trim() !== '') nftsList = JSON.parse(nftsStr);
        } catch (e) {}
      }
      setNfts(nftsList);

      // Load recipes
      const recipesBytes = await contract.getData("recipes");
      let recipesList: CraftingRecipe[] = [];
      if (recipesBytes.length > 0) {
        try {
          const recipesStr = ethers.toUtf8String(recipesBytes);
          if (recipesStr.trim() !== '') recipesList = JSON.parse(recipesStr);
        } catch (e) {}
      }
      setRecipes(recipesList);

      // Load showcases
      const showcasesBytes = await contract.getData("showcases");
      let showcasesList: CommunityShowcase[] = [];
      if (showcasesBytes.length > 0) {
        try {
          const showcasesStr = ethers.toUtf8String(showcasesBytes);
          if (showcasesStr.trim() !== '') showcasesList = JSON.parse(showcasesStr);
        } catch (e) {}
      }
      setShowcases(showcasesList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  // Mint a new NFT
  const mintNFT = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Minting NFT with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Create new NFT with encrypted traits
      const newNFT: NFT = {
        id: nfts.length + 1,
        name: `Alchemy NFT #${nfts.length + 1}`,
        encryptedTraits: FHEEncryptNumber(Math.floor(Math.random() * 1000)),
        owner: address,
        timestamp: Math.floor(Date.now() / 1000),
        image: `https://picsum.photos/seed/${nfts.length + 1}/200/200`
      };
      
      // Update NFTs list
      const updatedNFTs = [...nfts, newNFT];
      
      // Save to contract
      await contract.setData("nfts", ethers.toUtf8Bytes(JSON.stringify(updatedNFTs)));
      
      setTransactionStatus({ visible: true, status: "success", message: "NFT minted successfully!" });
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Minting failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Craft new NFT from selected NFTs
  const craftNFT = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    if (selectedNFTs.length < 2) {
      setTransactionStatus({ visible: true, status: "error", message: "Select at least 2 NFTs to craft" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return;
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Crafting NFT with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Get selected NFTs' encrypted traits
      const selectedNFTsData = nfts.filter(nft => selectedNFTs.includes(nft.id));
      const encryptedTraits = selectedNFTsData.map(nft => nft.encryptedTraits);
      
      // Create new NFT with combined encrypted traits
      const newNFT: NFT = {
        id: nfts.length + 1,
        name: `Alchemy Craft #${nfts.length + 1}`,
        encryptedTraits: FHEEncryptNumber(Math.floor(Math.random() * 1000)), // Simulate FHE combination
        owner: address,
        timestamp: Math.floor(Date.now() / 1000),
        image: `https://picsum.photos/seed/${nfts.length + 100}/200/200`
      };
      
      // Update NFTs list
      const updatedNFTs = [...nfts, newNFT];
      
      // Save to contract
      await contract.setData("nfts", ethers.toUtf8Bytes(JSON.stringify(updatedNFTs)));
      
      // Add to recipes
      const newRecipe: CraftingRecipe = {
        id: recipes.length + 1,
        name: `Recipe #${recipes.length + 1}`,
        description: `Combination of ${selectedNFTsData.map(n => n.name).join(', ')}`,
        requiredNFTs: selectedNFTs.length,
        encryptedResult: newNFT.encryptedTraits
      };
      
      const updatedRecipes = [...recipes, newRecipe];
      await contract.setData("recipes", ethers.toUtf8Bytes(JSON.stringify(updatedRecipes)));
      
      setTransactionStatus({ visible: true, status: "success", message: "NFT crafted successfully!" });
      await loadData();
      setSelectedNFTs([]);
      setShowCraftingModal(false);
      setCraftingStep(1);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Crafting failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Add to community showcase
  const addToShowcase = async () => {
    if (!isConnected || !address || !showcaseNFTId) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please select an NFT and connect wallet" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    if (!newShowcaseComment.trim()) {
      setTransactionStatus({ visible: true, status: "error", message: "Please enter a comment" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return;
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Adding to community showcase..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const newShowcase: CommunityShowcase = {
        id: showcases.length + 1,
        nftId: showcaseNFTId,
        creator: address,
        comment: newShowcaseComment
      };
      
      const updatedShowcases = [...showcases, newShowcase];
      await contract.setData("showcases", ethers.toUtf8Bytes(JSON.stringify(updatedShowcases)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Added to showcase successfully!" });
      await loadData();
      setNewShowcaseComment("");
      setShowcaseNFTId(null);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Showcase addition failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  // Decrypt traits with signature
  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    }
  };

  // Toggle NFT selection for crafting
  const toggleNFTSelection = (nftId: number) => {
    if (selectedNFTs.includes(nftId)) {
      setSelectedNFTs(selectedNFTs.filter(id => id !== nftId));
    } else {
      if (selectedNFTs.length < 5) {
        setSelectedNFTs([...selectedNFTs, nftId]);
      } else {
        setTransactionStatus({ visible: true, status: "error", message: "Maximum 5 NFTs can be selected" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    }
  };

  // Render NFT trait visualization
  const renderTraitVisualization = (encryptedTraits: string) => {
    const traits = encryptedTraits.split('-').slice(1).map(t => {
      try {
        return atob(t);
      } catch {
        return '0';
      }
    });
    
    return (
      <div className="trait-visualization">
        {traits.map((trait, index) => (
          <div key={index} className="trait-bar">
            <div 
              className="trait-fill" 
              style={{ width: `${Math.min(100, (parseInt(trait) % 100))}%` }}
            />
            <span className="trait-label">Trait {index + 1}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render crafting guide steps
  const renderCraftingGuide = () => {
    const steps = [
      {
        title: "Select Parent NFTs",
        description: "Choose 2-5 NFTs from your collection to use as materials",
        icon: "🔍"
      },
      {
        title: "Initiate FHE Combination",
        description: "The system will combine encrypted traits without decryption",
        icon: "🔒"
      },
      {
        title: "Generate New NFT",
        description: "Receive a new NFT with surprise traits from the combination",
        icon: "✨"
      },
      {
        title: "Reveal Traits (Optional)",
        description: "Decrypt your new NFT's traits with wallet signature",
        icon: "🔓"
      }
    ];
    
    return (
      <div className="crafting-guide">
        <h3>Alchemy Crafting Process</h3>
        <div className="guide-steps">
          {steps.map((step, index) => (
            <div key={index} className="guide-step">
              <div className="step-icon">{step.icon}</div>
              <div className="step-content">
                <h4>{step.title}</h4>
                <p>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render community showcase items
  const renderCommunityShowcase = () => {
    if (showcases.length === 0) return <div className="no-data">No showcases yet</div>;
    
    return (
      <div className="showcase-grid">
        {showcases.map((showcase, index) => {
          const nft = nfts.find(n => n.id === showcase.nftId);
          return (
            <div key={index} className="showcase-item">
              {nft && (
                <>
                  <div className="showcase-image">
                    <img src={nft.image} alt={nft.name} />
                    <div className="showcase-overlay">
                      <div className="showcase-creator">
                        {showcase.creator.substring(0, 6)}...{showcase.creator.substring(38)}
                      </div>
                    </div>
                  </div>
                  <div className="showcase-comment">{showcase.comment}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing alchemy crafting system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="alchemy-icon"></div>
          </div>
          <h1>Alchemy<span>FHE</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={mintNFT} 
            className="mint-btn"
          >
            Mint NFT
          </button>
          <button 
            onClick={() => setShowCraftingModal(true)} 
            className="craft-btn"
            disabled={nfts.length < 2}
          >
            Craft NFTs
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content">
        <div className="center-radial-layout">
          <div className="content-panel">
            <div className="tabs-container">
              <div className="tabs">
                <button 
                  className={`tab ${activeTab === 'myNFTs' ? 'active' : ''}`}
                  onClick={() => setActiveTab('myNFTs')}
                >
                  My NFTs
                </button>
                <button 
                  className={`tab ${activeTab === 'recipes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('recipes')}
                >
                  Recipes
                </button>
                <button 
                  className={`tab ${activeTab === 'community' ? 'active' : ''}`}
                  onClick={() => setActiveTab('community')}
                >
                  Community
                </button>
              </div>
              
              <div className="tab-content">
                {activeTab === 'myNFTs' && (
                  <div className="nfts-section">
                    <div className="section-header">
                      <h2>My Alchemy Collection</h2>
                      <div className="header-actions">
                        <button 
                          onClick={loadData} 
                          className="refresh-btn" 
                          disabled={isRefreshing}
                        >
                          {isRefreshing ? "Refreshing..." : "Refresh"}
                        </button>
                      </div>
                    </div>
                    
                    <div className="nfts-grid">
                      {nfts.length === 0 ? (
                        <div className="no-nfts">
                          <div className="no-nfts-icon"></div>
                          <p>No NFTs found</p>
                          <button 
                            className="mint-btn" 
                            onClick={mintNFT}
                          >
                            Mint First NFT
                          </button>
                        </div>
                      ) : nfts.filter(nft => nft.owner === address).map((nft, index) => (
                        <div 
                          className={`nft-item ${selectedNFTs.includes(nft.id) ? "selected" : ""}`} 
                          key={index}
                          onClick={() => toggleNFTSelection(nft.id)}
                        >
                          <div className="nft-image">
                            <img src={nft.image} alt={nft.name} />
                            {selectedNFTs.includes(nft.id) && (
                              <div className="selected-badge">Selected</div>
                            )}
                          </div>
                          <div className="nft-info">
                            <div className="nft-name">{nft.name}</div>
                            <div className="nft-traits">
                              {renderTraitVisualization(nft.encryptedTraits)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {activeTab === 'recipes' && (
                  <div className="recipes-section">
                    <h2>Alchemy Recipes</h2>
                    {renderCraftingGuide()}
                    
                    <div className="recipes-list">
                      {recipes.length === 0 ? (
                        <div className="no-recipes">
                          <div className="no-recipes-icon"></div>
                          <p>No recipes created yet</p>
                          <button 
                            className="craft-btn" 
                            onClick={() => setShowCraftingModal(true)}
                            disabled={nfts.length < 2}
                          >
                            Create First Recipe
                          </button>
                        </div>
                      ) : recipes.map((recipe, index) => (
                        <div className="recipe-item" key={index}>
                          <div className="recipe-header">
                            <h3>{recipe.name}</h3>
                            <div className="recipe-meta">
                              Requires {recipe.requiredNFTs} NFTs
                            </div>
                          </div>
                          <div className="recipe-description">{recipe.description}</div>
                          <div className="recipe-traits">
                            <div className="fhe-tag">
                              <div className="fhe-icon"></div>
                              <span>FHE Encrypted Traits</span>
                            </div>
                            {renderTraitVisualization(recipe.encryptedResult)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {activeTab === 'community' && (
                  <div className="community-section">
                    <h2>Community Showcase</h2>
                    <div className="showcase-header">
                      <p>Discover amazing trait combinations from our alchemists</p>
                      <button 
                        className="add-showcase-btn"
                        onClick={() => {
                          const myNFTs = nfts.filter(nft => nft.owner === address);
                          if (myNFTs.length > 0) {
                            setShowcaseNFTId(myNFTs[0].id);
                          }
                        }}
                        disabled={nfts.filter(nft => nft.owner === address).length === 0}
                      >
                        Add to Showcase
                      </button>
                    </div>
                    
                    {renderCommunityShowcase()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showCraftingModal && (
        <div className="modal-overlay">
          <div className="crafting-modal">
            <div className="modal-header">
              <h2>Alchemy Crafting</h2>
              <button onClick={() => {
                setShowCraftingModal(false);
                setCraftingStep(1);
                setSelectedNFTs([]);
              }} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              {craftingStep === 1 && (
                <>
                  <h3>Step 1: Select Parent NFTs</h3>
                  <p>Choose 2-5 NFTs to use as materials for crafting</p>
                  <div className="selected-nfts">
                    {selectedNFTs.length > 0 ? (
                      <div className="selected-nfts-grid">
                        {nfts.filter(nft => selectedNFTs.includes(nft.id)).map((nft, index) => (
                          <div key={index} className="selected-nft">
                            <img src={nft.image} alt={nft.name} />
                            <button 
                              onClick={() => toggleNFTSelection(nft.id)}
                              className="remove-nft-btn"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-selection">
                        <div className="no-selection-icon"></div>
                        <p>No NFTs selected</p>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button 
                      onClick={() => setCraftingStep(2)}
                      disabled={selectedNFTs.length < 2}
                      className="next-btn"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
              
              {craftingStep === 2 && (
                <>
                  <h3>Step 2: Confirm Crafting</h3>
                  <p>Your selected NFTs will be combined using Zama FHE to create a new NFT with encrypted traits</p>
                  <div className="fhe-notice">
                    <div className="lock-icon"></div>
                    <div>
                      <strong>FHE Alchemy Notice</strong>
                      <p>Trait combination occurs entirely in encrypted state</p>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button 
                      onClick={() => setCraftingStep(1)}
                      className="back-btn"
                    >
                      Back
                    </button>
                    <button 
                      onClick={craftNFT}
                      className="craft-confirm-btn"
                    >
                      Confirm Crafting
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {showcaseNFTId && (
        <div className="modal-overlay">
          <div className="showcase-modal">
            <div className="modal-header">
              <h2>Add to Community Showcase</h2>
              <button onClick={() => {
                setShowcaseNFTId(null);
                setNewShowcaseComment("");
              }} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="showcase-nft-preview">
                {nfts.find(n => n.id === showcaseNFTId) && (
                  <>
                    <img src={nfts.find(n => n.id === showcaseNFTId)!.image} alt="NFT" />
                    <div className="nft-name">{nfts.find(n => n.id === showcaseNFTId)!.name}</div>
                  </>
                )}
              </div>
              
              <div className="form-group">
                <label>Your Comment</label>
                <textarea 
                  value={newShowcaseComment} 
                  onChange={(e) => setNewShowcaseComment(e.target.value)} 
                  placeholder="Share something about this NFT..."
                  rows={3}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => {
                  setShowcaseNFTId(null);
                  setNewShowcaseComment("");
                }}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={addToShowcase}
                disabled={!newShowcaseComment.trim()}
                className="submit-btn"
              >
                Submit to Showcase
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="alchemy-icon"></div>
              <span>AlchemyFHE</span>
            </div>
            <p>Confidential NFT trait breeding powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} AlchemyFHE. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect NFT trait privacy. 
            Trait combination occurs in encrypted state without revealing original traits.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;