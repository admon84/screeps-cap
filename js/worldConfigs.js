// Copied from screeps renderer demo
// Created by vedi

require('@screeps/renderer-metadata');

module.exports = {
  ATTACK_PENETRATION: 10,
  CELL_SIZE: 100,
  RENDER_SIZE: {
    width: 2048,
    height: 2048
  },
  VIEW_BOX: 5000,
  BADGE_URL: '/api/user/badge-svg?username=%1',
  metadata: RENDERER_METADATA,
  gameData: {
    player: '',
    showMyNames: {
      spawns: false,
      creeps: false
    },
    showEnemyNames: {
      spawns: false,
      creeps: false
    },
    showFlagsNames: false,
    showCreepSpeech: false,
    swampTexture: 'low' //'animated', 'low', 'disabled'
  },
  lighting: 'static', //'normal', 'static', 'disabled'
  forceCanvas: false
};
