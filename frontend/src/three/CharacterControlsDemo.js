import React, { Component } from 'react';

import * as THREE from 'three';
import { GLTFLoader } from './GLTFLoader';
import { FBXLoader } from './FBXLoader';
import { OrbitControls } from "./controls/OrbitControls";


class BasicCharacterControls {
	constructor(params) {
		this._params = params;
		this._move = {
		  forward: false,
		  backward: false,
		  left: false,
		  right: false,
		};
		this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
		this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
		this._velocity = new THREE.Vector3(0, 0, 0);
		document.addEventListener('keydown', this._onKeyDown.bind(this), false);
		document.addEventListener('keyup', this._onKeyUp.bind(this), false);
	}

	_onKeyDown(event) {
		switch (event.keyCode) {
		  case 87: // w
		    this._move.forward = true;
		    break;
		  case 65: // a
		    this._move.left = true;
		    break;
		  case 83: // s
		    this._move.backward = true;
		    break;
		  case 68: // d
		    this._move.right = true;
		    break;
		  case 38: // up
		  case 37: // left
		  case 40: // down
		  case 39: // right
		    break;
		}
	}

	_onKeyUp(event) {
		switch(event.keyCode) {
		  case 87: // w
		    this._move.forward = false;
		    break;
		  case 65: // a
		    this._move.left = false;
		    break;
		  case 83: // s
		    this._move.backward = false;
		    break;
		  case 68: // d
		    this._move.right = false;
		    break;
		  case 38: // up
		  case 37: // left
		  case 40: // down
		  case 39: // right
		    break;
		}
	}

	Update(timeInSeconds) {
		const velocity = this._velocity;
		const frameDecceleration = new THREE.Vector3(
		    velocity.x * this._decceleration.x,
		    velocity.y * this._decceleration.y,
		    velocity.z * this._decceleration.z
		);
		frameDecceleration.multiplyScalar(timeInSeconds);
		frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
		    Math.abs(frameDecceleration.z), Math.abs(velocity.z));

		velocity.add(frameDecceleration);

		const controlObject = this._params.target;
		const _Q = new THREE.Quaternion();
		const _A = new THREE.Vector3();
		const _R = controlObject.quaternion.clone();

		if (this._move.forward) {
		  velocity.z += this._acceleration.z * timeInSeconds;
		}
		if (this._move.backward) {
		  velocity.z -= this._acceleration.z * timeInSeconds;
		}
		if (this._move.left) {
		  _A.set(0, 1, 0);
		  _Q.setFromAxisAngle(_A, Math.PI * timeInSeconds * this._acceleration.y);
		  _R.multiply(_Q);
		}
		if (this._move.right) {
		  _A.set(0, 1, 0);
		  _Q.setFromAxisAngle(_A, -Math.PI * timeInSeconds * this._acceleration.y);
		  _R.multiply(_Q);
		}

		controlObject.quaternion.copy(_R);

		const oldPosition = new THREE.Vector3();
		oldPosition.copy(controlObject.position);

		const forward = new THREE.Vector3(0, 0, 1);
		forward.applyQuaternion(controlObject.quaternion);
		forward.normalize();

		const sideways = new THREE.Vector3(1, 0, 0);
		sideways.applyQuaternion(controlObject.quaternion);
		sideways.normalize();

		sideways.multiplyScalar(velocity.x * timeInSeconds);
		forward.multiplyScalar(velocity.z * timeInSeconds);

		controlObject.position.add(forward);
		controlObject.position.add(sideways);

		oldPosition.copy(controlObject.position);
	}
}


class LoadModelDemo extends Component {
  constructor(props) {
  	super(props);
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });


	this.clock = new THREE.Clock();

    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(75, 20, 0);

    this._scene = new THREE.Scene();

    let light = new THREE.DirectionalLight(0xFFFFFF, 1.0);
    light.position.set(20, 100, 10);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.left = 100;
    light.shadow.camera.right = -100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    this._scene.add(light);

    light = new THREE.AmbientLight(0xFFFFFF, 4.0);
    this._scene.add(light);

    const controls = new OrbitControls(
      this._camera, this._threejs.domElement);
    controls.target.set(0, 20, 0);
    controls.update();

    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
        './resources/posx.jpg',
        './resources/negx.jpg',
        './resources/posy.jpg',
        './resources/negy.jpg',
        './resources/posz.jpg',
        './resources/negz.jpg',
    ]);
    this._scene.background = texture;

    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100, 10, 10),
        new THREE.MeshStandardMaterial({
            color: 0x202020,
          }));
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.rotation.x = -Math.PI / 2;
    this._scene.add(plane);

    this._mixers = [];
    this._previousRAF = null;
	this._LoadAnimatedModel = this._LoadAnimatedModel.bind(this);
    //this._LoadAnimatedModel();
    // this._LoadAnimatedModelAndPlay(
    //     './resources/dancer/', 'girl.fbx', 'dance.fbx', new THREE.Vector3(0, -1.5, 5));
    // this._LoadAnimatedModelAndPlay(
    //     './resources/dancer/', 'dancer.fbx', 'Silly Dancing.fbx', new THREE.Vector3(12, 0, -10));
    // this._LoadAnimatedModelAndPlay(
    //     './resources/dancer/', 'dancer.fbx', 'Silly Dancing.fbx', new THREE.Vector3(-12, 0, -10));
    //this._RAF();
  }

	componentDidMount(){
	  this.mount.appendChild(this._threejs.domElement)
	  window.addEventListener("resize", this._OnWindowResize.bind(this));
	  this._LoadAnimatedModel();
	  //this._LoadModel('./models/gltf/paragon_pirate_skeleton_sailor_35_animations/scene.gltf');
	  this._LoadAnimatedModelAndPlay('./resources/vampire/', 'Old Man Idle.fbx', 'Walk.fbx', new THREE.Vector3(0, 0, 0));
	  this.start()
	}

	componentWillUnmount(){
		this.stop()
		this.mount.removeChild(this._threejs.domElement)
	}

	_OnWindowResize() {
	  this._camera.aspect = window.innerWidth / window.innerHeight;
	  this._camera.updateProjectionMatrix();
	  this._threejs.setSize(window.innerWidth, window.innerHeight);
	}


	_LoadAnimatedModel() {
		const loader = new FBXLoader();
		loader.setPath('./resources/zombie/');
		loader.load('mremireh_o_desbiens.fbx', (fbx) => {
		  fbx.scale.setScalar(0.1);
		  fbx.traverse(c => {
		    c.castShadow = true;
		  });

		  const params = {
		    target: fbx,
		    camera: this._camera,
		  }
		  this._controls = new BasicCharacterControls(params);

		  const anim = new FBXLoader();
		  anim.setPath('./resources/zombie/');
		  anim.load('walk.fbx', (anim) => {
		    const m = new THREE.AnimationMixer(fbx);
		    this._mixers.push(m);
		    const idle = m.clipAction(anim.animations[0]);
		    idle.play();
		  });
		  this._scene.add(fbx);
		});
	}

	_LoadAnimatedModelAndPlay(path, modelFile, animFile, offset) {
		const loader = new FBXLoader();
		loader.setPath(path);
		loader.load(modelFile, (fbx) => {
		  fbx.scale.setScalar(0.1);
		  fbx.traverse(c => {
		    c.castShadow = true;
		  });
		  fbx.position.copy(offset);

		  const anim = new FBXLoader();
		  anim.setPath(path);
		  anim.load(animFile, (anim) => {
		    const m = new THREE.AnimationMixer(fbx);
		    this._mixers.push(m);
		    const idle = m.clipAction(anim.animations[0]);
		    idle.play();
		  });
		  this._scene.add(fbx);
		});
	}

	_LoadModel(path) {
		const loader = new GLTFLoader();
		loader.load(path, (gltf) => {
		  gltf.scene.scale.setScalar(10);
		  gltf.scene.traverse(c => {
		    c.castShadow = true;
		  });
		  this._scene.add(gltf.scene);
		});
	}

	start = () => {
		if (!this.frameId) {
		  this.frameId = requestAnimationFrame(this.animate)
		}
	}

	stop = () => {
	    cancelAnimationFrame(this.frameId)
	}

	animate = () => {

		this.delta = this.clock.getDelta();
		this.timer = Date.now() * 0.001;

		if (this._mixers) {
		  for ( const mixer of this._mixers ) mixer.update( this.delta );
		}

		if (this._controls) {
		  this._controls.Update(this.delta);
		}

		this.renderScene()
		this.frameId = window.requestAnimationFrame(this.animate)
	}

	renderScene = () => {
	  this._threejs.render(this._scene, this._camera)
	}

render(){
    return(
      <div
        className="App-intro"
        ref={(mount) => { this.mount = mount }}
      />
    )
  }
}

export default LoadModelDemo;