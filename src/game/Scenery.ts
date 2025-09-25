import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

const OBJ_FILE = '/assets/models/scenery/trees.obj';
const MTL_FILE = '/assets/models/scenery/trees.mtl';
const PNG_PREFIX = '/assets/models/scenery/';
const DEFAULT_SCENERY_COUNT = 20;

export class SceneryManager {
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly models = new Map<string, THREE.Object3D>();
  private loaded = false;

  constructor(private readonly scene: THREE.Scene, private readonly count = DEFAULT_SCENERY_COUNT) {}

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const materials = await new MTLLoader().loadAsync(MTL_FILE);
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    const object = await objLoader.loadAsync(OBJ_FILE);

    object.traverse(child => {
      if (!(child as THREE.Mesh).isMesh) {
        return;
      }

      const mesh = child as THREE.Mesh;
      const name = mesh.material?.name;
      if (!name) {
        return;
      }

      const texture = this.textureLoader.load(`${PNG_PREFIX}${name}.png`);
      const materialsArray = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      materialsArray.forEach(material => {
        if ('map' in material) {
          (material as THREE.Material & { map?: THREE.Texture }).map = texture;
        }
        if ('shininess' in material) {
          (material as { shininess: number }).shininess = 0;
        }
      });

      this.models.set(name, mesh);
    });

    const names = Array.from(this.models.keys());
    for (let i = 0; i < this.count; i += 1) {
      const name = names[Math.floor(Math.random() * names.length)];
      this.addScenery(name);
    }

    this.loaded = true;
  }

  private addScenery(name: string): void {
    const model = this.models.get(name);
    if (!model) {
      console.error('Scenery model not defined:', name);
      return;
    }

    const clone = model.clone(true);
    clone.position.set(
      THREE.MathUtils.randFloatSpread(100),
      0,
      THREE.MathUtils.randFloatSpread(100)
    );
    clone.scale.set(10, 10, 10);

    this.scene.add(clone);
  }
}
