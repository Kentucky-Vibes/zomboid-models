/**
 * Hand-written .x documents in the shape the game's exporter produces. They contain no game data.
 */

export const HEADER = 'xof 0303txt 0032\n';

export const TEMPLATES = `
template Frame {
 <3d82ab46-62da-11cf-ab39-0020af71e433>
 [...]
}

template SkinWeights {
 <6f0d123b-bad2-4167-a0d0-80224f25fabb>
 STRING transformNodeName;
 DWORD nWeights;
 array DWORD vertexIndices[nWeights];
 array FLOAT weights[nWeights];
 Matrix4x4 matrixOffset;
}
`;

export const IDENTITY =
  '1.000000,0.000000,0.000000,0.000000,0.000000,1.000000,0.000000,0.000000,0.000000,0.000000,1.000000,0.000000,0.000000,0.000000,0.000000,1.000000;;';

/** A two-bone skeleton with a skinned quad (two triangles) textured with cloth.png. */
export const SKINNED_QUAD = `${HEADER}${TEMPLATES}
Material _01_-_Default {
 1.000000;1.000000;1.000000;1.000000;;
 9.999999;
 0.000000;0.000000;0.000000;;
 0.000000;0.000000;0.000000;;

 TextureFilename {
  "cloth.png";
 }
}

Frame Dummy01 {

 FrameTransformMatrix {
  1.000000,0.000000,0.000000,0.000000,0.000000,-0.000000,-1.000000,0.000000,0.000000,1.000000,-0.000000,0.000000,0.000000,0.000000,0.000000,1.000000;;
 }

 Frame Bip01 {

  FrameTransformMatrix {
   ${IDENTITY}
  }

  Frame Bip01_Head {

   FrameTransformMatrix {
    1.000000,0.000000,0.000000,0.000000,0.000000,1.000000,0.000000,0.000000,0.000000,0.000000,1.000000,0.000000,0.000000,0.500000,0.000000,1.000000;;
   }
  }
 }
}

Frame Quad {

 FrameTransformMatrix {
  ${IDENTITY}
 }

 Mesh Quad {
  4;
  0.000000;0.000000;0.000000;,
  1.000000;0.000000;0.000000;,
  1.000000;1.000000;0.000000;,
  0.000000;1.000000;0.000000;;
  2;
  3;0,1,2;,
  3;0,2,3;;

  MeshNormals {
   1;
   0.000000;0.000000;1.000000;;
   2;
   3;0,0,0;,
   3;0,0,0;;
  }

  MeshMaterialList {
   1;
   2;
   0,
   0;
   { _01_-_Default }
  }

  MeshTextureCoords c1 {
   4;
   0.000000;1.000000;,
   1.000000;1.000000;,
   1.000000;0.000000;,
   0.000000;0.000000;;
  }

  XSkinMeshHeader {
   2;
   3;
   2;
  }

  SkinWeights {
   "Bip01";
   4;
   0,
   1,
   2,
   3;
   1.000000,
   1.000000,
   0.250000,
   0.250000;
   ${IDENTITY}
  }

  SkinWeights {
   "Bip01_Head";
   2;
   2,
   3;
   0.750000,
   0.750000;
   1.000000,0.000000,0.000000,0.000000,0.000000,1.000000,0.000000,0.000000,0.000000,0.000000,1.000000,0.000000,0.000000,-0.500000,0.000000,1.000000;;
  }
 }
}
`;

/** A one-bone animation with rotation, scale, and position keys. */
export const SIMPLE_ANIMATION = `${HEADER}${TEMPLATES}
Frame Bip01 {

 FrameTransformMatrix {
  ${IDENTITY}
 }
}

AnimTicksPerSecond  {
 4800;
}

AnimationSet Bob_Test {

 Animation {

  { Bip01 }

  AnimationKey R {
   0;
   2;
   0;4;1.000000,0.000000,0.000000,0.000000;;,
   2400;4;0.707107,0.707107,0.000000,0.000000;;;
  }

  AnimationKey S {
   1;
   1;
   0;3;1.000000,1.000000,1.000000;;;
  }

  AnimationKey T {
   2;
   2;
   0;3;0.000000,0.000000,0.000000;;,
   2400;3;0.000000,0.100000,0.000000;;;
  }
 }
}
`;
