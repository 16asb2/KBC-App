import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/context/auth';
import { ThemedText } from '@/components/themed-text';

export default function LoginScreen() {
  const { signIn, loading } = useAuth();

  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.title}>KBC App</ThemedText>
      <ThemedText style={styles.subtitle}>We connect through Google</ThemedText>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <GoogleSigninButton
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={signIn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: 24,
    opacity: 0.6,
  },
});
