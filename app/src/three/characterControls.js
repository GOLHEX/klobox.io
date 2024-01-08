import React, { Component } from "react"
import * as THREE from 'three'
import {  OrbitControls } from "./controls/OrbitControls";
//import { A, D, DIRECTIONS, S, W } from './utils'
const { W, A, S, D, DIRECTIONS } = require('./utils');



export default class CharacterControls extends Component {
        // state
         toggleRun = false;
         currentAction;

        // temporary data
        walkDirection = new THREE.Vector3()
        rotateAngle = new THREE.Vector3(0, 1, 0)
        rotateQuarternion = new THREE.Quaternion()
        cameraTarget = new THREE.Vector3()

        // constants
        fadeDuration = 0.2;
        runVelocity = 7;
        walkVelocity = 3;

        constructor( model,
        mixer, animationsMap,
        orbitControl, camera,
        currentAction, socket, props ) {
        super(props);
        this.model = model
        this.mixer = mixer
        this.animationsMap = animationsMap
        this.currentAction = currentAction
        this.animationsMap.forEach((value, key) => {
            if (key == currentAction) {
                value.play()
            }
        })

        this.controls = orbitControl
        this.camera = camera
        //console.log(camera)
        this.socket = socket


        this.model.children[ 0 ].name = this.socket.id

        console.log(this.model.children[ 0 ].name)


        this.updateCameraTarget(0,0)

        this.switchRunToggle = this.switchRunToggle.bind(this);
        this.update = this.update.bind(this);

    }

    switchRunToggle() {
        //console.log('yep');
        this.toggleRun = !this.toggleRun
    }

    update(delta, keysPressed) {
        const directionPressed = DIRECTIONS.some(key => keysPressed[key] == true)

        var play = '';
        if (directionPressed && this.toggleRun) {
            play = 'Run'
        } else if (directionPressed) {
            play = 'Walk'
        } else {
            play = 'Idle'
        }

        if (this.currentAction != play) {
            const toPlay = this.animationsMap.get(play)
            const current = this.animationsMap.get(this.currentAction)

            current.fadeOut(this.fadeDuration)
            toPlay.reset().fadeIn(this.fadeDuration).play();

            this.currentAction = play
        }

        this.mixer.update(delta)

        if (this.currentAction == 'Run' || this.currentAction == 'Walk') {
            // calculate towards camera direction
            var angleYCameraDirection = Math.atan2(
                    (this.camera.position.x - this.model.position.x),
                    (this.camera.position.z - this.model.position.z))
            // diagonal movement angle offset
            //console.log(keysPressed)
            var directionOffset = this.directionOffset(keysPressed)
            // rotate model
            this.rotateQuarternion.setFromAxisAngle(this.rotateAngle, angleYCameraDirection + directionOffset)
            //console.log(this.rotateQuarternion)
            this.model.quaternion.rotateTowards(this.rotateQuarternion, 0.2)
            //this.model.rotation.x = -Math.PI/2;

            // calculate direction
            this.camera.getWorldDirection(this.walkDirection)
            this.walkDirection.y = 0
            this.walkDirection.normalize()
            this.walkDirection.applyAxisAngle(this.rotateAngle, directionOffset)

            // run/walk velocity
            const velocity = this.currentAction == 'Run' ? this.runVelocity : this.walkVelocity

            // move model & camera
            const moveX = this.walkDirection.x * velocity * delta
            const moveZ = this.walkDirection.z * velocity * delta
            this.model.position.x += moveX
            this.model.position.z += moveZ
            this.updateCameraTarget(moveX, moveZ)
            //this.socket.emit('CameraTarget', moveX, moveZ)
        }
    }

    updateCameraTarget(moveX, moveZ) {
        // move camera
        //
        //console.log(moveX, moveZ)
        this.camera.position.x += moveX
        this.camera.position.z += moveZ

        // update camera target
        this.cameraTarget.x = this.model.position.x
        this.cameraTarget.y = this.model.position.y + 1
        this.cameraTarget.z = this.model.position.z
        this.controls.target = this.cameraTarget
    }

    directionOffset(keysPressed) {
        var directionOffset = 0 // w

        if (keysPressed[W]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4 // w+a
            } else if (keysPressed[D]) {
                directionOffset = - Math.PI / 4 // w+d
            }
        } else if (keysPressed[S]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4 + Math.PI / 2 // s+a
            } else if (keysPressed[D]) {
                directionOffset = -Math.PI / 4 - Math.PI / 2 // s+d
            } else {
                directionOffset = Math.PI // s
            }
        } else if (keysPressed[A]) {
            directionOffset = Math.PI / 2 // a
        } else if (keysPressed[D]) {
            directionOffset = - Math.PI / 2 // d
        }

        return directionOffset
    }
}