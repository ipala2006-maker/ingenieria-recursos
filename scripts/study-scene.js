import { createTimerDepth } from './timer-depth.js?v=20261003-refined';

export function createStudyScene(host) {
  return createTimerDepth(host,{home:true});
}
