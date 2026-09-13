import { createTimerDepth } from './timer-depth.js?v=20260913-phase';

export function createStudyScene(host) {
  return createTimerDepth(host,{home:true});
}
