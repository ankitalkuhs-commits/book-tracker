// src/components/AuthForm.jsx
import React, { useState } from "react";
import { GoogleLogin } from '@react-oauth/google';
import { apiFetch } from "../services/api";

/*
  AuthForm
  Props:
    - onSuccess(token, user) -> callback when login/signup success
*/
export default function AuthForm({ onSuccess }) {
  const [busy, setBusy] = useState(false);

  async function handleGoogleSuccess(credentialResponse) {
    setBusy(true);
    try {
      const data = await apiFetch("/auth/google", {
        method: "POST",
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const token = data?.access_token || data?.token || data;
      const user = data?.user || null;
      onSuccess && onSuccess(token, user);
    } catch (error) {
      alert(error.message || "Google sign in failed");
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleError() {
    alert("Google sign in failed. Please try again.");
  }

  return (
    <div style={{ 
      maxWidth: 520,
      textAlign: 'center',
      padding: '2rem',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
    }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ 
          margin: '0 0 0.5rem 0',
          fontSize: '2rem',
          color: '#1f2937'
        }}>
          Welcome to TrackMyRead
        </h2>
        <p style={{ 
          margin: 0,
          color: '#6b7280',
          fontSize: '1rem'
        }}>
          Sign in to start tracking your reading journey
        </p>
      </div>
      
      {/* Google Sign In Button */}
      <div style={{ 
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '1rem'
      }}>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          useOneTap
          text="signin_with"
        />
      </div>

      <p style={{
        fontSize: '0.875rem',
        color: '#9ca3af',
        margin: '1rem 0 0 0'
      }}>
        By continuing, you agree to our{' '}
        <a href="#/terms" style={{ color: '#667eea', textDecoration: 'none' }}>Terms</a>
        {' and '}
        <a href="#/privacy" style={{ color: '#667eea', textDecoration: 'none' }}>Privacy Policy</a>
      </p>
    </div>
  );
}
