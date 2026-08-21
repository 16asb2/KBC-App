import { useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KBC } from '@/constants/theme';

export type DropdownOption = { label: string; value: string };

type Props = {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accentColor?: string;
};

export function DropdownPicker({ options, value, onChange, placeholder = 'Select…', accentColor = KBC.cyan }: Props) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const selected = options.find(o => o.value === value);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]}>
          {selected?.label ?? placeholder}
        </Text>
        <Text style={[styles.arrow, { color: accentColor }]}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.handle} />
          <FlatList
            data={options}
            keyExtractor={o => o.value}
            renderItem={({ item }) => {
              const sel = item.value === value;
              return (
                <TouchableOpacity
                  style={[styles.option, sel && { backgroundColor: accentColor + '18' }]}
                  onPress={() => { onChange(item.value); setOpen(false); }}
                >
                  <Text style={[styles.optionText, sel && { color: accentColor, fontWeight: '700' }]}>
                    {item.label}
                  </Text>
                  {sel && <Text style={[styles.check, { color: accentColor }]}>✓</Text>}
                </TouchableOpacity>
              );
            }}
            style={{ maxHeight: 360 }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 12, backgroundColor: '#fafafa', marginTop: 4,
  },
  triggerText: { flex: 1, fontSize: 14, color: '#111' },
  placeholder:  { color: '#aaa' },
  arrow: { fontSize: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginBottom: 8,
  },
  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  optionText: { flex: 1, fontSize: 15, color: '#111' },
  check: { fontSize: 16 },
});
