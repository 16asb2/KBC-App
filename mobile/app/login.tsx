import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '@/context/auth';
import { ThemedText } from '@/components/themed-text';

export default function LoginScreen() {
  const { signIn, signInWithApple, loading } = useAuth();

  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.title}>KBC App</ThemedText>
      <ThemedText style={styles.subtitle}>Sign in to continue</ThemedText>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <View style={styles.buttons}>
          <GoogleSigninButton
            size={GoogleSigninButton.Size.Wide}
            color={GoogleSigninButton.Color.Dark}
            onPress={signIn}
          />
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={5}
              style={styles.appleButton}
              onPress={signInWithApple}
            />
          )}
        </View>
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
  buttons: {
    alignItems: 'center',
    gap: 12,
  },
  appleButton: {
    width: 192,
    height: 48,
  },
});
