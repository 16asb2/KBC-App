import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useState } from 'react';

GoogleSignin.configure({
  webClientId: '935469832384-5lt4dolp216lrugqtjrcn3274hjqenqj.apps.googleusercontent.com',
});

type User = {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    GoogleSignin.getCurrentUser().then((currentUser) => {
      if (currentUser) {
        setUser({
          id: currentUser.data.user.id,
          name: currentUser.data.user.name,
          email: currentUser.data.user.email,
          photo: currentUser.data.user.photo,
        });
      }
      setLoading(false);
    });
  }, []);

  async function signIn() {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (isSuccessResponse(response)) {
      setUser({
        id: response.data.user.id,
        name: response.data.user.name,
        email: response.data.user.email,
        photo: response.data.user.photo,
      });
    }
  }

  async function signOut() {
    await GoogleSignin.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
