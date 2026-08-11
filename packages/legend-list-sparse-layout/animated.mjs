import { Animated } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';

// src/integrations/animated.tsx
var AnimatedLegendList = Animated.createAnimatedComponent(LegendList);

export { AnimatedLegendList };
