// src/App.jsx
import React, { useEffect, useState } from "react";
import { GoogleOAuthProvider } from '@react-oauth/google';
import Header from "./components/Header";
import ModernHeader from "./components/shared/ModernHeader";
import Sidebar from "./components/Sidebar";
import BookList from "./components/BookList";
import AddBook from "./components/AddBook";
import UserLibrary from "./components/UserLibrary";
import Feed from "./components/Feed";
import FollowPanel from "./components/FollowPanel";
import AuthForm from "./components/AuthForm";
import Profile from "./components/Profile";
import { styles } from "./styles";
import { apiFetch, authHeaders } from "./services/api";
import BPFeed from "./pages/BPFeed";
import BPLibrary from "./pages/BPLibrary";
import HomePage from "./pages/HomePage";
import LibraryPage from "./pages/LibraryPage";
import AdminPage from "./pages/AdminPage";
import AboutPage from "./pages/AboutPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import HelpPage from "./pages/HelpPage";
import ContactPage from "./pages/ContactPage";
import Footer from "./components/shared/Footer";

// TODO: Replace with your actual Google OAuth Client ID from Google Cloud Console
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "YOUR_GOOGLE_CLIENT_ID_HERE";

function AppContent(){
  const [route,setRoute] = useState(() => {
    const hash = window.location.hash.slice(2); // Remove '#/' prefix
    return hash || "home";
  });
  const [user,setUser] = useState(null);
  const [books,setBooks] = useState([]);
  const [library,setLibrary] = useState([]);
  const [feed,setFeed] = useState([]);
  const [msg,setMsg] = useState(null);

  // Custom setRoute that also updates URL hash
  const navigateToRoute = (newRoute) => {
    window.location.hash = `#/${newRoute}`;
    setRoute(newRoute);
  };

  useEffect(() => {
    const token = localStorage.getItem("bt_token");
    if (token) {
      // Fetch current user data
      loadCurrentUser();
    }

    // Listen for hash changes for proper URL routing
    const handleHashChange = () => {
      const hash = window.location.hash.slice(2); // Remove '#/' prefix
      if (hash) {
        setRoute(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  async function loadCurrentUser() {
    try {
      const userData = await apiFetch("/profile/me");
      setUser(userData);
    } catch (error) {
      console.error('Error loading user:', error);
      // If token is invalid, clear it
      if (error.message.includes('401')) {
        localStorage.removeItem("bt_token");
        setUser(null);
      }
    }
  }

  useEffect(()=> {
    setMsg(null);
    const load = () => {
      if(route==="books") loadBooks();
      else if(route==="library") loadLibrary();
      else if(route==="feed") loadFeed();
    };
    load();
    const iv = setInterval(load, 10000);
    return ()=>clearInterval(iv);
  }, [route]);

  async function loadBooks(){
    try {
      const data = await apiFetch("/books/");
      setBooks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading books:', error);
    }
  }
  
  async function loadLibrary(){
    try {
      const data = await apiFetch("/userbooks/");
      setLibrary(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading library:', error);
      if (error.message.includes('401')) {
        setMsg("Please login to view your library");
      }
    }
  }
  
  async function loadFeed(){
    try {
      const data = await apiFetch("/notes/feed");
      setFeed(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading feed:', error);
    }
  }

  async function addToLibrary(bookId){
    const token = localStorage.getItem("bt_token");
    if(!token){ alert("Login first"); return; }
    
    try {
      await apiFetch("/userbooks/", { 
        method: "POST", 
        body: JSON.stringify({ book_id: bookId, status: "to-read", current_page: 0 }) 
      });
      setMsg("Added to library"); 
      loadLibrary();
    } catch (error) {
      console.error('Error adding to library:', error);
      setMsg("Failed to add");
    }
  }

  function logout(){ localStorage.removeItem("bt_token"); setUser(null); navigateToRoute("home"); setMsg("Logged out"); }

  const isModernPage = route === "home" || route === "my-library" || route === "profile" || route === "login" || route === "signup" || route === "admin" || route === "about" || route === "privacy" || route === "terms" || route === "help" || route === "contact";

  return (
    <div className="min-h-screen bg-gray-50">
      {isModernPage ? (
        <ModernHeader user={user} onRoute={navigateToRoute} onLogout={logout} route={route} />
      ) : (
        <Header user={user} onRoute={navigateToRoute} onLogout={logout} route={route} />
      )}
      
      {/* New BookPulse Pages - Full Width */}
      {route==="home" && <HomePage user={user} onRoute={navigateToRoute} />}
      {route==="my-library" && <LibraryPage />}
      {route==="admin" && <AdminPage />}
      {route==="about" && <AboutPage onRoute={navigateToRoute} />}
      {route==="privacy" && <PrivacyPage />}
      {route==="terms" && <TermsPage />}
      {route==="help" && <HelpPage />}
      {route==="contact" && <ContactPage onRoute={navigateToRoute} />}
      {route==="profile" && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
          <Profile setMsg={setMsg} />
        </div>
      )}
      {route==="signup" && (
        <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2rem' }}>
          {msg && <div style={{ padding: '1rem', marginBottom: '1rem', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '0.5rem' }}>{msg}</div>}
          <AuthForm type="signup" onSuccess={(token,u)=>{ 
            localStorage.setItem("bt_token", token); 
            setUser(u||{}); 
            navigateToRoute("home"); 
            setMsg("Signed up");
            // Fetch full user data
            if (u) loadCurrentUser();
          }} />
        </div>
      )}
      {route==="login" && (
        <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2rem' }}>
          {msg && <div style={{ padding: '1rem', marginBottom: '1rem', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '0.5rem' }}>{msg}</div>}
          <AuthForm type="login" onSuccess={(token,u)=>{ 
            localStorage.setItem("bt_token", token); 
            setUser(u||{}); 
            navigateToRoute("home"); 
            setMsg("Logged in");
            // Fetch full user data
            if (u) loadCurrentUser();
          }} />
        </div>
      )}
      
      {/* Legacy routes with old layout */}
      {!isModernPage && (
        <div style={styles.container}>
          <Sidebar route={route} />
          <main style={styles.main}>
            {msg && <div style={styles.alert}>{msg}</div>}
            
            {route==="books" && <>
              <h2>All Books</h2>
              <BookList books={books} onAddToLibrary={addToLibrary} />
              <AddBook onAdded={()=>{ loadBooks(); setMsg("Book added"); }} />
            </>}
            {route==="library" && <>
              <h2>My Library</h2>
              <UserLibrary items={library} onRefresh={loadLibrary} setMsg={setMsg} />
            </>}
            {route==="feed" && <>
              <h2>Feed</h2>
              <Feed items={feed} />
            </>}
            {route==="bp-feed" && <>
              <h2>BookPulse Feed (Preview)</h2>
              <BPFeed />
            </>}
            {route === "bp-library" && <>
             <h2>My Library (Preview)</h2>
              <BPLibrary />
            </>}

            {route==="follow" && <FollowPanel onMessage={setMsg} />}
          </main>
        </div>
      )}
      
      {/* Footer - shown on all modern pages */}
      {isModernPage && <Footer onRoute={navigateToRoute} />}
    </div>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AppContent />
    </GoogleOAuthProvider>
  );
}
