// Login Screen - Google OAuth
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { authAPI } from '../services/api';

export default function LoginScreen({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);

  // For now, we'll use a demo login (Week 3 will add real Google OAuth)
  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      // Demo login - gets or creates a user with your email
      const response = await fetch('https://book-tracker-backend-0hiz.onrender.com/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@bookpulse.com' }) // Change this to your email if you want
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      await authAPI.saveToken(data.access_token);
      Alert.alert('Success', `Welcome, ${data.user.name}!`);
      onLoginSuccess();
      
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>📚</Text>
        <Text style={styles.title}>BookPulse</Text>
        <Text style={styles.subtitle}>Track your reading journey</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleDemoLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.demoNote}>
          Demo Login - Tap to test!{'\n'}
          (Full Google OAuth coming in Week 3)
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  logo: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleIcon: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
    marginRight: 12,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  demoNote: {
    marginTop: 20,
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
