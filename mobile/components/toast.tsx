import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { KBC } from '@/constants/theme';

type Props = { message: string; visible: boolean; onHide: () => void };

export function Toast({ message, visible, onHide }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1640),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onHide(); });
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: KBC.black,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: KBC.green,
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  text: { color: KBC.white, fontSize: 14, fontWeight: '700' },
});
