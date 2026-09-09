import { createTimerDepth } from './timer-depth.js?v=20260909-depth2';

export function createStudyScene(host) {
  return createTimerDepth(host,{home:true});
}
