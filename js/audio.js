app.initAudio = () => {
  console.log('Initialising audio...');

  app.sounds = {
    walk: { url: 'assets/audio/walk.mp3', loop: true, rate: 0.7 },
    cow: { url: 'assets/audio/cow.mp3' },
    pig: { url: 'assets/audio/pig.mp3' },
    pug: { url: 'assets/audio/dog.mp3' },
    llama: { url: 'assets/audio/llama.mp3' },
    zebra: { url: 'assets/audio/zebra.mp3' },
    sheep: { url: 'assets/audio/sheep.mp3' },
    horse: { url: 'assets/audio/horse.mp3' },
    skeleton: { url: 'assets/audio/skeleton.mp3' },
  };

  const listener = new THREE.AudioListener();
  app.camera.add(listener); // lets us do positional sounds

  const audioLoader = new THREE.AudioLoader();

  for (const key in app.sounds) {

    const sound = app.sounds[key];

    sound.audio = new THREE.Audio(listener);

    audioLoader.load(sound.url, buffer => {
      sound.audio.setBuffer(buffer);
      sound.audio.setLoop(sound.loop || false);
      sound.audio.setVolume(0.5);
      sound.audio.setPlaybackRate(sound.rate || 1);
    });

  } // for each sound


}; // app.initAudio()
