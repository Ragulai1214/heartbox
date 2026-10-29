import { CpuRandomController } from './cpuRandomController.js';
import { CpuFrequencyController } from './cpuFrequencyController.js';
import { CpuHighValueController } from './cpuHighValueController.js';

export function createCpu(type, random = Math.random) {
  switch (type) {
    case 'frequency': return new CpuFrequencyController({ random });
    case 'random': return new CpuRandomController(random);
    case 'high-value': return new CpuHighValueController(random);
    case 'recent': return new CpuFrequencyController({ random, windowSize: 5 });
    default: throw new RangeError(`Unknown CPU: ${type}`);
  }
}
