// Login Screen - Google OAuth (Native)
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authAPI } from '../services/api';

export default function LoginScreen({ onLoginSuccess, preloadedFeed }) {
  const [loading, setLoading] = useState(false);
  const [publicPosts, setPublicPosts] = useState(preloadedFeed || []);
  const [feedLoading, setFeedLoading] = useState(!preloadedFeed);

  // Configure Google Sign-In (runs once on mount)
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '580873034102-ukh12uuph4c17eqvvbjl1a48alrfepok.apps.googleusercontent.com', // Web client for ID token
      offlineAccess: false,
    });
    console.log('🔑 Google Sign-In configured');
  }, []);

  useEffect(() => {
    // Only load feed if not already preloaded
    if (!preloadedFeed) {
      loadPublicFeed();
    }
  }, [preloadedFeed]);

  const handleGoogleLogin = async (idToken) => {
    setLoading(true);
    try {
      console.log('📤 Sending ID token to backend...');
      const response = await fetch('https://book-tracker-backend-0hiz.onrender.com/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Authentication failed');
      }
      
      const data = await response.json();
      console.log('✅ Backend auth success:', data.user);
      await authAPI.saveToken(data.access_token);
      Alert.alert('Welcome!', `Signed in as ${data.user.name}`);
      onLoginSuccess();
      
    } catch (error) {
      console.error('❌ Google login error:', error);
      Alert.alert('Sign In Failed', error.message || 'Could not authenticate');
    } finally {
      setLoading(false);
    }
  };

  const loadPublicFeed = async () => {
    try {
      const response = await fetch('https://book-tracker-backend-0hiz.onrender.com/notes/feed?limit=10');
      const data = await response.json();
      setPublicPosts(data || []);
    } catch (error) {
      console.error('Error loading public feed:', error);
    } finally {
      setFeedLoading(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const postDate = new Date(timestamp);
    const diffMs = now - postDate;
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays}d ago`;
    return postDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleSignIn = async () => {
    setLoading(true);
    try {
      // Sign out first to force account picker
      await GoogleSignin.signOut();
      
      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices();
      
      // Sign in and get user info
      const userInfo = await GoogleSignin.signIn();
      console.log('✅ Google Sign-In Success:', userInfo);
      
      // Get ID token
      const tokens = await GoogleSignin.getTokens();
      console.log('🎫 ID Token received');
      
      // Send to backend
      await handleGoogleLogin(tokens.idToken);
      
    } catch (error) {
      console.error('❌ Google Sign-In Error:', error);
      
      if (error.code === 'SIGN_IN_CANCELLED') {
        console.log('🚫 User cancelled sign-in');
      } else if (error.code === 'IN_PROGRESS') {
        Alert.alert('Please wait', 'Sign-in already in progress');
      } else if (error.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        Alert.alert('Error', 'Google Play Services not available');
      } else {
        Alert.alert('Sign In Failed', error.message || 'Could not sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.fixedHeader}>
        <View style={styles.headerTop}>
          <Text style={styles.logo}>📚</Text>
          <Text style={styles.title}>TrackMyRead</Text>
        </View>
        <Text style={styles.subtitle}>Track, Journal & Share Your Reading Journey</Text>
        
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Public Feed */}
      <ScrollView style={styles.feedContainer} contentContainerStyle={styles.feedContent}>
        <Text style={styles.feedTitle}>Community Posts</Text>
        
        {publicPosts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📚</Text>
            <Text style={styles.emptyText}>
              {feedLoading ? 'Loading posts...' : 'No posts yet'}
            </Text>
          </View>
        ) : (
          publicPosts.map(post => (
            <View key={post.id} style={styles.postCard}>
              {/* Community Post Header */}
              <View style={styles.postHeader}>
                <Text style={styles.communityIcon}>📚</Text>
                <Text style={styles.communityLabel}>Community Post</Text>
              </View>

              {/* Post Text */}
              {post.text && (
                <Text style={styles.postText}>{post.text}</Text>
              )}

              {/* Post Image */}
              {post.image_url && (
                <Image 
                  source={{ uri: post.image_url }} 
                  style={styles.postImage}
                  resizeMode="cover"
                />
              )}

              {/* Quote */}
              {post.quote && (
                <View style={styles.quoteContainer}>
                  <Text style={styles.quoteText}>"{post.quote}"</Text>
                </View>
              )}

              {/* Date */}
              <Text style={styles.postDate}>{formatTimeAgo(post.created_at)}</Text>
            </View>
          ))
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Sign in to like, comment, and share your reading journey
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  fixedHeader: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 32,
    marginRight: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  googleIcon: {
    backgroundColor: '#fff',
    color: '#4285F4',
    fontSize: 18,
    fontWeight: 'bold',
    width: 28,
    height: 28,
    textAlign: 'center',
    lineHeight: 28,
    borderRadius: 4,
    marginRight: 12,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  demoButton: {
    backgroundColor: '#9333ea',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  demoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  feedContainer: {
    flex: 1,
  },
  feedContent: {
    paddingBottom: 40,
  },
  feedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyState: {
    padding: 60,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  postCard: {
    backgroundColor: '#fff',
    marginBottom: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  communityIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  communityLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  postText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  postImage: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    marginBottom: 12,
  },
  quoteContainer: {
    backgroundColor: '#f9f9f9',
    borderLeftWidth: 3,
    borderLeftColor: '#0066cc',
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
  quoteText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#555',
    lineHeight: 20,
  },
  postDate: {
    fontSize: 13,
    color: '#999',
  },
  footer: {
    padding: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
