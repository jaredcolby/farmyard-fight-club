
// Keyboard event handlers and state management goes here

app.initKeys = () => {
  console.log('Initialising keys...');

  app.keys = {
    trackedKeys: {
      ArrowUp: true,
      ArrowDown: true,
      ArrowLeft: true,
      ArrowRight: true,
      c: true,   // toggle camera POV from world to player
      " ": true,
    },

    state: {},  // which keys are currently held?
  };

  app.keys.handleKey = (ev, pressed) => {

    const player = Player.one;

    switch( ev.key || ev.keyCode){

    case 'ArrowUp':
      if( pressed ){
        app.sounds.walk.audio.setPlaybackRate(app.sounds.walk.rate)
        player.changeState('walk');
        app.sounds.walk.audio.play();
      } else {
        app.sounds.walk.audio.stop();
        player.changeState('idle');
      }
      break;

    case 'ArrowDown':
      if( pressed ){
        console.log('DOWN pressed!');
        // TODO: how to sync up audio rate with animation rate?;
        app.sounds.walk.audio.setPlaybackRate(.5)
        app.sounds.walk.audio.play();
        // passes in a object with walkSpeed/timeScale as a negative values to reverse the direction.
        player.changeState('walk', { walkSpeed: -.30, timeScale: -1 } );
      } else {
        console.log('DOWN released!');
        app.sounds.walk.audio.stop();
        player.changeState('idle');
      }
      break;

    case " ":
      if( pressed ){
        console.log('SPACEBAR pressed!');
        // TODO: how to sync up audio rate with animation rate?;
        app.sounds.walk.audio.setPlaybackRate(.5)
        app.sounds.walk.audio.play();
        // passes in a object with walkSpeed/timeScale as a negative values to reverse the direction.
        player.changeState('jump');
      } else {
        console.log('SPACEBAR released!');
        app.sounds.walk.audio.stop(); 
        player.changeState('idle');
      }
      break;

    case 'c':
      if( pressed ){

        if( app.controls.cameraPOV === 'world' ){
          // Switch to 'player' and actually change camera POV
          app.controls.cameraPOV = 'player';
          app.cameraControls.saveState(); // remember the world POV pan angle and zoom level
          player.object.add( app.camera );  // camera becomes a child of player, follows it
          app.camera.position.set(0, 10, -20);
          // 1. Work out what the player is looking at
          // 2. Look at the same thing, or slighty ahead
          const charPos = player.object.position.clone();
          charPos.add( new THREE.Vector3(0, 10, 0) ); // look slightly ahead of current position
          // charPos.y += 10;
          app.camera.lookAt( charPos );
        } else {
          // switch to 'world'
          app.controls.cameraPOV = 'world';
          player.object.remove( app.camera );
          app.cameraControls.reset(); // back to where we were when we did .saveState()
        }
        console.log('Camera POV', app.controls.cameraPOV);

      }
      break;



    default:
      console.log('Key not handled: ', ev.key);
      console.log('Key not handled: ', ev);
      break;
    }
  };


  // Deal with the keys that we need to run code for
  // repeatedly, i.e. they keep triggering actions for
  // as long as they are held (not just when they're first
  // pressed or released)
  app.keys.handleHeldKeys = () => {

    const turnIncrement = 0.03;
    const player = Player.one;

    if( app.keys.state.ArrowLeft ){
      player.object.rotateY( turnIncrement );
    } else if( app.keys.state.ArrowRight ){
      player.object.rotateY( -turnIncrement );
    }

  } // handleHeldKeys()


  // This event fires repeatedly, for as long as the key is held down
  // The rate of repeat depends on your system's key repeat rate setting
  document.addEventListener('keydown', ev => {
 
    if( !(ev.key in app.keys.trackedKeys) ){
      return; // early return for keys we're not supposed to track
    }

    ev.stopPropagation(); // don't send keys like arrow keys to camera controls

    if( app.keys.state[ ev.key ] ){
      return; // ignore keypress events which are not the first press event (i.e. held)
    }

    app.keys.state[ ev.key ] = true;
    app.keys.handleKey( ev, true ); // handle first press event for this key
  });


  document.addEventListener('keyup', ev => {
    ev.stopPropagation();
    app.keys.state[ ev.key ] = false;  // no longer held down!
    app.keys.handleKey( ev, false );  // call handleKey again, but pressed=false
  });


}; // app.initKeys();
