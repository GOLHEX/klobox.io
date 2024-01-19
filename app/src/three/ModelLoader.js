import React, { Component } from "react"
//import Tetra from './Tetra';
import * as THREE from "three";

import { GLTFLoader } from './GLTFLoader';
import * as SkeletonUtils from './SkeletonUtils';



export default class ModelLoader extends Component {
    constructor(user, path, userModel, props) {
        super(props);
        this.user = user;
        this.path = path;
        this.userModel = userModel;
        //this.modelOnLoad;



        this.onLoadFunc = this.onLoadFunc.bind(this);
        this.onLoading = this.onLoading.bind(this);

        // const manager = new THREE.LoadingManager();
        // manager.onStart = function ( url, itemsLoaded, itemsTotal ) {

        //     console.log( 'Started loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );

        // };
        // manager.onLoad = function ( ) {

        //     console.log( 'Loading complete!');
        //     loadComplete = 1;

        // };
        //console.log(this.user)

    }

    onLoading(){
        //const scene = new THREE.Scene();
        let modelOnLoad = [];

        let loader = new GLTFLoader(  );
        loader.load('models/gltf/Soldier.glb', function (gltf) {
            const model = gltf.scene;
            model.traverse(function (object) {
                if (object.isMesh) object.castShadow = true;
            });

            const gltfAnimations = gltf.animations;

            const mixer = new THREE.AnimationMixer(model);

            const animationsMap = new Map();

            gltfAnimations.filter(function (a) { return a.name != 'TPose'; }).forEach(function (a) {
                animationsMap.set(a.name, mixer.clipAction(a));
                //console.log(animationsMap);
            });

            //mixers.push( mixer );

            modelOnLoad.push( model, mixer, animationsMap);

        }, this.onLoadFunc(modelOnLoad) );
    }

    onLoadFunc(modelOnLoad){
        //return modelOnLoad;
        console.log('model loading complete');
        console.log(modelOnLoad);
        this.userModel = modelOnLoad;
    }


}


