// VRM VIEWER - FIXED VIEW WITH EYE BLINKING AND CONTROLLABLE POSE
document.addEventListener('DOMContentLoaded', function () {
    
    // Elements
    const canvas = document.getElementById('canvas');
    const loadingScreen = document.getElementById('loading');
    const statusText = document.getElementById('progress-text');
    const errorDiv = document.getElementById('error');
    
    function updateStatus(msg) {
        console.log(msg);
        if (statusText) statusText.textContent = msg;
    }
    
    function showError(msg) {
        console.error(msg);
        if (errorDiv) {
            errorDiv.textContent = "ERROR: " + msg;
            errorDiv.classList.remove('hidden');
        }
        if (loadingScreen) loadingScreen.classList.add('hidden');
    }
    
    /* =======================
       SCENE & CAMERA - FIXED
    ======================= */
    updateStatus("Setting up scene...");
    
    const scene = new THREE.Scene();
    // CHANGE: Set scene background to transparent
    scene.background = null; // Mengubah dari new THREE.Color(0xffffff) menjadi null
    
    const camera = new THREE.PerspectiveCamera(
        38,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    
    camera.position.set(0, 1.6, 1.8);
    camera.lookAt(0, 1.5, 0);
    
    /* =======================
       RENDERER - MODIFIED FOR TRANSPARENCY
    ======================= */
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true // Pastikan alpha diaktifkan
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // CHANGE: Enable transparency
    renderer.setClearColor(0x000000, 0); // Mengatur warna clear menjadi transparan
    
    /* =======================
       LIGHTING
    ======================= */
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(2, 8, 4);
    scene.add(mainLight);
    
    const faceLight = new THREE.DirectionalLight(0xffffff, 0.5);
    faceLight.position.set(0, 5, 3);
    scene.add(faceLight);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 10, 0);
    scene.add(topLight);
    
    /* =======================
       ANIMATION VARIABLES
    ======================= */
    let model = null;
    let eyeBones = { left: null, right: null };
    let blinkState = 0;
    let blinkTimer = 0;
    let breathingTimer = 0;
    let clock = new THREE.Clock();
    
    // === PENAMBAHAN: Variabel untuk efek senyum ===
    let faceMesh = null;
    let currentSmileValue = 0;
    const smileTarget = 0.75; // kekuatan senyum maksimal (0.0 - 1.0)
    
    // Pose settings for controlling arm and hand positions
    const POSE_SETTINGS = {
        upperArm: {
            downAngle: THREE.MathUtils.degToRad(120),
            forwardAngle: THREE.MathUtils.degToRad(77)
        },
        lowerArm: {
            left: { x: 0, y: 0, z: 0 },
            right: { x: 0, y: 0, z: 0 }
        },
        hands: {
            left: { x: 0, y: 0, z: THREE.MathUtils.degToRad(180) }, // 180° terbalik
            right: { x: 0, y: 0, z: THREE.MathUtils.degToRad(-180) } // -180° terbalik
        },
        spine: {
            forwardAngle: THREE.MathUtils.degToRad(0)
        }
    };
    
    // Bone references for direct manipulation
    let boneRefs = {
        leftUpperArm: null,
        rightUpperArm: null,
        leftLowerArm: null,
        rightLowerArm: null,
        leftHand: null,
        rightHand: null,
        spine: null,
        chest: null,
        neck: null,
        head: null
    };
    
    /* =======================
       LOAD VRM
    ======================= */
    updateStatus("Loading saka.vrm...");
    
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        'saka.vrm',
        function (gltf) {
            updateStatus("Setting up pose system...");
            
            model = gltf.scene;
            scene.add(model);
            
            /* =======================
               FIXED BODY POSITION
            ======================= */
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            // Center model
            model.position.x = -center.x;
            model.position.z = -center.z;
            
            // Natural standing position
            model.position.y = -size.y * 0.46;
            
            // Scale
            model.scale.setScalar(1.6);
            
            // Fixed rotation - facing front
            model.rotation.set(0, 0, 0);
            
            /* =======================
               FIND AND STORE BONE REFERENCES
            ======================= */
            let foundEyes = 0;
            
            model.traverse(function(child) {
                if (child.isBone) {
                    const name = child.name.toLowerCase();
                    
                    // Find eye bones for blinking
                    if (name.includes('eye')) {
                        if (name.includes('left') || name.includes('l_') || name.includes('_l')) {
                            eyeBones.left = child;
                            foundEyes++;
                            console.log("✅ Found left eye bone:", child.name);
                            child.userData.originalScaleY = child.scale.y;
                        } else if (name.includes('right') || name.includes('r_') || name.includes('_r')) {
                            eyeBones.right = child;
                            foundEyes++;
                            console.log("✅ Found right eye bone:", child.name);
                            child.userData.originalScaleY = child.scale.y;
                        } else if (!eyeBones.left && foundEyes === 0) {
                            eyeBones.left = child;
                            child.userData.originalScaleY = child.scale.y;
                        } else if (!eyeBones.right && foundEyes === 1) {
                            eyeBones.right = child;
                            child.userData.originalScaleY = child.scale.y;
                        }
                    }
                    
                    // Store bone references for pose control
                    if (name.includes('upperarm') || name.includes('upper_arm') || name.includes('shoulder')) {
                        if (name.includes('left') || name.includes('l_') || name.includes('_l')) {
                            boneRefs.leftUpperArm = child;
                            console.log("✅ Stored left upper arm bone:", child.name);
                        } else if (name.includes('right') || name.includes('r_') || name.includes('_r')) {
                            boneRefs.rightUpperArm = child;
                            console.log("✅ Stored right upper arm bone:", child.name);
                        }
                    }
                    else if (name.includes('lowerarm') || name.includes('lower_arm') || name.includes('forearm')) {
                        if (name.includes('left') || name.includes('l_') || name.includes('_l')) {
                            boneRefs.leftLowerArm = child;
                            console.log("✅ Stored left lower arm bone:", child.name);
                        } else if (name.includes('right') || name.includes('r_') || name.includes('_r')) {
                            boneRefs.rightLowerArm = child;
                            console.log("✅ Stored right lower arm bone:", child.name);
                        }
                    }
                    else if (name.includes('hand')) {
                        if (name.includes('left') || name.includes('l_') || name.includes('_l')) {
                            boneRefs.leftHand = child;
                            console.log("✅ Stored left hand bone:", child.name);
                        } else if (name.includes('right') || name.includes('r_') || name.includes('_r')) {
                            boneRefs.rightHand = child;
                            console.log("✅ Stored right hand bone:", child.name);
                        }
                    }
                    else if (name.includes('spine') || name.includes('chest')) {
                        if (!boneRefs.spine && name.includes('spine')) {
                            boneRefs.spine = child;
                            console.log("✅ Stored spine bone:", child.name);
                        }
                        if (!boneRefs.chest && name.includes('chest')) {
                            boneRefs.chest = child;
                            console.log("✅ Stored chest bone:", child.name);
                        }
                    }
                    else if (name.includes('neck')) {
                        boneRefs.neck = child;
                        console.log("✅ Stored neck bone:", child.name);
                    }
                    else if (name.includes('head')) {
                        boneRefs.head = child;
                        console.log("✅ Stored head bone:", child.name);
                    }
                    
                    // Alternative bone naming patterns (VRM specific)
                    if (!boneRefs.leftUpperArm && 
                        (name.includes('l_arm') || name === 'leftarm' || name === 'left_arm')) {
                        boneRefs.leftUpperArm = child;
                    }
                    if (!boneRefs.rightUpperArm && 
                        (name.includes('r_arm') || name === 'rightarm' || name === 'right_arm')) {
                        boneRefs.rightUpperArm = child;
                    }
                }

                // === PENAMBAHAN: Cari mesh wajah yang punya blendshape ===
                if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                    faceMesh = child;
                    console.log("✅ Found VRM face mesh with blendshapes:", child.name);
                }
            });
            
            // Apply the static natural pose
            applyStaticPose();
            
            console.log(`✅ Found ${foundEyes} eye bones for blinking`);
            console.log(`✅ Pose system initialized`);
            console.log(`✅ SAKA VRM with controllable pose ready`);
            
            updateStatus("✅ Ready with pose controls!");
            
            // CHANGE: Tambahkan CSS untuk transparansi pada canvas
            canvas.style.backgroundColor = 'transparent';
            
            // Hide loading screen
            setTimeout(() => {
                if (loadingScreen) loadingScreen.classList.add('hidden');
            }, 800);
            
            // Update info panel
            updateInfoPanel();
            
        },
        function (xhr) {
            if (xhr.lengthComputable) {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                updateStatus(`Loading: ${percent}%`);
            }
        },
        function (err) {
            showError("Failed to load VRM: " + err.message);
            console.error("❌ Failed to load VRM:", err);
        }
    );
    
    /* =======================
       POSE CONTROL FUNCTIONS
    ======================= */
    
    // Apply static natural pose using bone references
    function applyStaticPose() {
        console.log("🔄 Applying static pose with settings...");
        
        // Apply upper arm pose
        if (boneRefs.leftUpperArm) {
            const leftUpperEuler = new THREE.Euler(
                POSE_SETTINGS.upperArm.downAngle,
                0,
                POSE_SETTINGS.upperArm.forwardAngle
            );
            boneRefs.leftUpperArm.quaternion.setFromEuler(leftUpperEuler);
            console.log(`✅ Applied left upper arm: ${THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.downAngle)}° down, ${THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.forwardAngle)}° forward`);
        }
        
        if (boneRefs.rightUpperArm) {
            const rightUpperEuler = new THREE.Euler(
                POSE_SETTINGS.upperArm.downAngle,
                0,
                -POSE_SETTINGS.upperArm.forwardAngle
            );
            boneRefs.rightUpperArm.quaternion.setFromEuler(rightUpperEuler);
            console.log(`✅ Applied right upper arm: ${THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.downAngle)}° down, ${THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.forwardAngle)}° forward`);
        }
        
        // Apply lower arm rotations
        if (boneRefs.leftLowerArm) {
            const leftLowerEuler = new THREE.Euler(
                POSE_SETTINGS.lowerArm.left.x,
                POSE_SETTINGS.lowerArm.left.y,
                POSE_SETTINGS.lowerArm.left.z
            );
            boneRefs.leftLowerArm.quaternion.setFromEuler(leftLowerEuler);
            console.log(`✅ Applied left lower arm rotation`);
        }
        
        if (boneRefs.rightLowerArm) {
            const rightLowerEuler = new THREE.Euler(
                POSE_SETTINGS.lowerArm.right.x,
                POSE_SETTINGS.lowerArm.right.y,
                POSE_SETTINGS.lowerArm.right.z
            );
            boneRefs.rightLowerArm.quaternion.setFromEuler(rightLowerEuler);
            console.log(`✅ Applied right lower arm rotation`);
        }
        
        // Apply hand directions (180° reversed)
        if (boneRefs.leftHand) {
            const leftHandEuler = new THREE.Euler(
                POSE_SETTINGS.hands.left.x,
                POSE_SETTINGS.hands.left.y,
                POSE_SETTINGS.hands.left.z
            );
            boneRefs.leftHand.quaternion.setFromEuler(leftHandEuler);
            console.log(`✅ Applied left hand: 180° reversed (${THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.left.z)}°)`);
        }
        
        if (boneRefs.rightHand) {
            const rightHandEuler = new THREE.Euler(
                POSE_SETTINGS.hands.right.x,
                POSE_SETTINGS.hands.right.y,
                POSE_SETTINGS.hands.right.z
            );
            boneRefs.rightHand.quaternion.setFromEuler(rightHandEuler);
            console.log(`✅ Applied right hand: -180° reversed (${THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.right.z)}°)`);
        }
        
        // Apply spine and other bones
        if (boneRefs.spine) {
            const spineEuler = new THREE.Euler(POSE_SETTINGS.spine.forwardAngle, 0, 0);
            boneRefs.spine.quaternion.setFromEuler(spineEuler);
            console.log(`✅ Applied spine: ${THREE.MathUtils.radToDeg(POSE_SETTINGS.spine.forwardAngle)}° forward`);
        }
        
        if (boneRefs.chest) {
            boneRefs.chest.rotation.x = 0;
            boneRefs.chest.rotation.y = 0;
            boneRefs.chest.rotation.z = 0;
        }
        
        if (boneRefs.neck) {
            boneRefs.neck.rotation.x = 0;
            boneRefs.neck.rotation.y = 0;
            boneRefs.neck.rotation.z = 0;
        }
        
        if (boneRefs.head) {
            boneRefs.head.rotation.x = 0;
            boneRefs.head.rotation.y = 0;
            boneRefs.head.rotation.z = 0;
        }
        
        // Update matrix world
        model.updateMatrixWorld(true);
        
        console.log("✅ Static pose applied successfully");
    }
    
    // Function to set hand direction
    function setHandDirection(handSide, xDegrees = 0, yDegrees = 0, zDegrees = 0) {
        if (!model) {
            console.warn("Model belum dimuat!");
            return;
        }
        
        const x = THREE.MathUtils.degToRad(xDegrees);
        const y = THREE.MathUtils.degToRad(yDegrees);
        const z = THREE.MathUtils.degToRad(zDegrees);
        
        console.log(`✋ Setting ${handSide} hand direction: X=${xDegrees}°, Y=${yDegrees}°, Z=${zDegrees}°`);
        
        if (handSide === 'left' && boneRefs.leftHand) {
            const euler = new THREE.Euler(x, y, z);
            boneRefs.leftHand.quaternion.setFromEuler(euler);
            boneRefs.leftHand.updateMatrixWorld(true);
            
            POSE_SETTINGS.hands.left.x = x;
            POSE_SETTINGS.hands.left.y = y;
            POSE_SETTINGS.hands.left.z = z;
            
            console.log(`✅ Updated left hand direction`);
        }
        
        if (handSide === 'right' && boneRefs.rightHand) {
            const euler = new THREE.Euler(x, y, z);
            boneRefs.rightHand.quaternion.setFromEuler(euler);
            boneRefs.rightHand.updateMatrixWorld(true);
            
            POSE_SETTINGS.hands.right.x = x;
            POSE_SETTINGS.hands.right.y = y;
            POSE_SETTINGS.hands.right.z = z;
            
            console.log(`✅ Updated right hand direction`);
        }
        
        updateInfoPanel();
    }
    
    // Function to set lower arm rotation
    function setLowerArmRotation(armSide, xDegrees = 0, yDegrees = 0, zDegrees = 0) {
        if (!model) {
            console.warn("Model belum dimuat!");
            return;
        }
        
        const x = THREE.MathUtils.degToRad(xDegrees);
        const y = THREE.MathUtils.degToRad(yDegrees);
        const z = THREE.MathUtils.degToRad(zDegrees);
        
        console.log(`🔄 Setting ${armSide} lower arm rotation: X=${xDegrees}°, Y=${yDegrees}°, Z=${zDegrees}°`);
        
        if (armSide === 'left' && boneRefs.leftLowerArm) {
            const euler = new THREE.Euler(x, y, z);
            boneRefs.leftLowerArm.quaternion.setFromEuler(euler);
            boneRefs.leftLowerArm.updateMatrixWorld(true);
            
            POSE_SETTINGS.lowerArm.left.x = x;
            POSE_SETTINGS.lowerArm.left.y = y;
            POSE_SETTINGS.lowerArm.left.z = z;
            
            console.log(`✅ Updated left lower arm rotation`);
        }
        
        if (armSide === 'right' && boneRefs.rightLowerArm) {
            const euler = new THREE.Euler(x, y, z);
            boneRefs.rightLowerArm.quaternion.setFromEuler(euler);
            boneRefs.rightLowerArm.updateMatrixWorld(true);
            
            POSE_SETTINGS.lowerArm.right.x = x;
            POSE_SETTINGS.lowerArm.right.y = y;
            POSE_SETTINGS.lowerArm.right.z = z;
            
            console.log(`✅ Updated right lower arm rotation`);
        }
        
        updateInfoPanel();
    }
    
    // Function to set upper arm pose
    function setUpperArmPose(downDegrees = 125, forwardDegrees = 79) {
        if (!model) {
            console.warn("Model belum dimuat!");
            return;
        }
        
        POSE_SETTINGS.upperArm.downAngle = THREE.MathUtils.degToRad(downDegrees);
        POSE_SETTINGS.upperArm.forwardAngle = THREE.MathUtils.degToRad(forwardDegrees);
        
        console.log(`🔄 Setting upper arm: ${downDegrees}° down, ${forwardDegrees}° forward`);
        
        if (boneRefs.leftUpperArm) {
            const euler = new THREE.Euler(
                POSE_SETTINGS.upperArm.downAngle,
                0,
                POSE_SETTINGS.upperArm.forwardAngle
            );
            boneRefs.leftUpperArm.quaternion.setFromEuler(euler);
            boneRefs.leftUpperArm.updateMatrixWorld(true);
        }
        
        if (boneRefs.rightUpperArm) {
            const euler = new THREE.Euler(
                POSE_SETTINGS.upperArm.downAngle,
                0,
                -POSE_SETTINGS.upperArm.forwardAngle
            );
            boneRefs.rightUpperArm.quaternion.setFromEuler(euler);
            boneRefs.rightUpperArm.updateMatrixWorld(true);
        }
        
        console.log("✅ Upper arm pose updated");
        updateInfoPanel();
    }
    
    // Function to update all poses
    function updateAllPoses() {
        if (!model) {
            console.warn("Model belum dimuat!");
            return;
        }
        
        console.log("🔄 Updating all poses with current settings...");
        
        setUpperArmPose(
            THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.downAngle),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.forwardAngle)
        );
        
        setLowerArmRotation('left', 
            THREE.MathUtils.radToDeg(POSE_SETTINGS.lowerArm.left.x),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.lowerArm.left.y),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.lowerArm.left.z)
        );
        
        setLowerArmRotation('right',
            THREE.MathUtils.radToDeg(POSE_SETTINGS.lowerArm.right.x),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.lowerArm.right.y),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.lowerArm.right.z)
        );
        
        setHandDirection('left',
            THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.left.x),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.left.y),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.left.z)
        );
        
        setHandDirection('right',
            THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.right.x),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.right.y),
            THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.right.z)
        );
        
        console.log("✅ All poses updated");
    }
    
    // Update info panel with current pose settings
    function updateInfoPanel() {
        const infoPanel = document.getElementById('info');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <h3>🎮 SAKA VRM - POSE CONTROLLER</h3>
                <p>View: <strong>Fixed Half Body</strong></p>
                <p>Pose: <strong>Arms Down 125°</strong></p>
                <p style="color:#00ff88; margin-top:8px; font-size:14px;">
                    ✓ Upper Arms: ${Math.round(THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.downAngle))}° Down<br>
                    ✓ Forward: ${Math.round(THREE.MathUtils.radToDeg(POSE_SETTINGS.upperArm.forwardAngle))}°<br>
                    ✓ Hands: ${Math.round(THREE.MathUtils.radToDeg(POSE_SETTINGS.hands.left.z))}° Reversed<br>
                    ✓ Eye Blinking (automatic)<br>
                    ✓ Subtle Breathing
                </p>
                <p style="font-size:12px; color:#aaa; margin-top:10px;">
                    Arms: Fully extended downward (125°)<br>
                    Palms: Backward facing (180° reversed)<br>
                    Posture: Natural upright stance
                </p>
            `;
        }
    }
    
    /* =======================
       EYE BLINKING FUNCTION
    ======================= */
    function updateEyeBlinking(deltaTime) {
        if (!eyeBones.left || !eyeBones.right) return;
        
        blinkTimer += deltaTime;
        
        if (blinkTimer > 3 + Math.random() * 2) {
            blinkState = 0.1;
            blinkTimer = 0;
        }
        
        if (blinkState > 0) {
            blinkState += deltaTime * 12;
            
            let blinkProgress;
            if (blinkState < 0.5) {
                blinkProgress = blinkState * 2;
            } else {
                blinkProgress = (1 - blinkState) * 2;
            }
            
            blinkProgress = Math.max(0, Math.min(1, blinkProgress));
            const eyeScaleY = 1 - (blinkProgress * 0.8);
            
            eyeBones.left.scale.y = eyeScaleY * (eyeBones.left.userData.originalScaleY || 1);
            eyeBones.right.scale.y = eyeScaleY * (eyeBones.right.userData.originalScaleY || 1);
            
            if (blinkState > 1) {
                blinkState = 0;
                eyeBones.left.scale.y = eyeBones.left.userData.originalScaleY || 1;
                eyeBones.right.scale.y = eyeBones.right.userData.originalScaleY || 1;
            }
        }
    }
    
    /* =======================
       IDLE BREATHING FUNCTION
    ======================= */
    function updateIdleBreathing(deltaTime) {
        if (!boneRefs.spine && !boneRefs.chest) return;
        
        breathingTimer += deltaTime * 1.5;
        
        // Very subtle breathing
        const breathAmount = Math.sin(breathingTimer) * 0.005;
        
        if (boneRefs.spine) {
            boneRefs.spine.rotation.x = 0.02 + breathAmount * 0.05;
        }
        
        if (boneRefs.chest) {
            boneRefs.chest.rotation.x = 0.01 + breathAmount * 0.03;
        }
        
        // Very subtle shoulder movement with breathing
        if (boneRefs.leftUpperArm) {
            const currentDown = POSE_SETTINGS.upperArm.downAngle;
            boneRefs.leftUpperArm.rotation.x = currentDown + breathAmount * 0.02;
        }
        
        if (boneRefs.rightUpperArm) {
            const currentDown = POSE_SETTINGS.upperArm.downAngle;
            boneRefs.rightUpperArm.rotation.x = currentDown + breathAmount * 0.02;
        }
    }
    
    /* =======================
       PENAMBAHAN: Fungsi untuk mengatur senyum
    ======================= */
    function setSmile(value) {
        if (!faceMesh || !faceMesh.morphTargetInfluences) return;
        
        const dict = faceMesh.morphTargetDictionary;
        
        // Nama blendshape senyum yang umum di VRM
        const smileNames = ['Joy', 'Happy', 'smile', 'Smile', 'joy', 'A'];
        
        let applied = false;
        for (const name of smileNames) {
            const idx = dict[name];
            if (idx !== undefined) {
                faceMesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(
                    faceMesh.morphTargetInfluences[idx] || 0,
                    value,
                    0.18  // kecepatan transisi
                );
                applied = true;
            }
        }
        
        if (!applied) {
            console.warn("⚠️ Tidak menemukan blendshape senyum di model");
        }
    }
    
    function updateSmileExpression() {
        const textarea = document.getElementById('message-input');
        if (!textarea) return;
        
        const isTyping = (document.activeElement === textarea) && (textarea.value.trim().length > 0);
        const targetValue = isTyping ? smileTarget : 0;
        
        currentSmileValue = THREE.MathUtils.lerp(currentSmileValue, targetValue, 0.12);
        setSmile(currentSmileValue);
    }
    
    /* =======================
       DISABLE ALL USER CONTROLS
    ======================= */
    const blockEvent = (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    
    canvas.addEventListener('mousedown', blockEvent);
    canvas.addEventListener('mousemove', blockEvent);
    canvas.addEventListener('mouseup', blockEvent);
    canvas.addEventListener('wheel', blockEvent);
    canvas.addEventListener('contextmenu', blockEvent);
    canvas.addEventListener('touchstart', blockEvent);
    canvas.addEventListener('touchmove', blockEvent);
    canvas.addEventListener('touchend', blockEvent);
    
    document.addEventListener('keydown', (e) => {
        const blockedKeys = [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'r', 'R', 'c', 'C', '+', '-', '=', '_'
        ];
        
        if (blockedKeys.includes(e.key)) {
            blockEvent(e);
        }
    });
    
    canvas.style.cursor = 'default';
    canvas.style.userSelect = 'none';
    
    /* =======================
       MAIN ANIMATION LOOP
    ======================= */
    function animate() {
        requestAnimationFrame(animate);
        
        const deltaTime = clock.getDelta();
        
        // Update camera (fixed look)
        camera.lookAt(0, 1.5, 0);
        
        // Update animations
        updateEyeBlinking(deltaTime);
        updateIdleBreathing(deltaTime);
        
        // === PENAMBAHAN: Update efek senyum setiap frame ===
        updateSmileExpression();
        
        renderer.render(scene, camera);
    }
    
    // Start animation
    animate();
    
    /* =======================
       RESIZE HANDLER
    ======================= */
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // === PENAMBAHAN: Listener tambahan agar lebih responsif ===
    const textarea = document.getElementById('message-input');
    if (textarea) {
        textarea.addEventListener('input', updateSmileExpression);
        textarea.addEventListener('focus', updateSmileExpression);
        textarea.addEventListener('blur', updateSmileExpression);
    }

});