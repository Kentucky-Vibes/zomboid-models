import { Euler, MathUtils, Object3D } from 'three';

import type { ManifestAttachment } from '../format/manifest.js';

/**
 * Builds the transform of an attachment as the game composes it: translate by the offset, then
 * rotate about X, Y, and Z in that order (degrees), then scale.
 */
export function attachmentNode(attachment: ManifestAttachment | undefined, name: string): Object3D {
  const node = new Object3D();
  node.name = name;
  if (attachment) {
    node.position.set(attachment.offset[0], attachment.offset[1], attachment.offset[2]);
    node.setRotationFromEuler(
      new Euler(
        MathUtils.degToRad(attachment.rotate[0]),
        MathUtils.degToRad(attachment.rotate[1]),
        MathUtils.degToRad(attachment.rotate[2]),
        'XYZ',
      ),
    );
    node.scale.setScalar(attachment.scale);
  }
  return node;
}
