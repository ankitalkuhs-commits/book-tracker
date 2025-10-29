// src/App.jsx
import React, { useEffect, useState } from "react";
import Header from "./components/Header";
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

export default function App(){
  const [route,setRoute] = useState("books");
  const [user,setUser] = useState(null);
  const [books,setBooks] = useState([]);
  const [library,setLibrary] = useState([]);
  const [feed,setFeed] = useState([]);
  const [msg,setMsg] = useState(null);

  useEffect(()=>{ if(localStorage.getItem("bt_token")) setUser({}); }, []);

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
    const r = await apiFetch("/books/");
    if(r.ok) setBooks(Array.isArray(r.data)?r.data:[]);
  }
  async function loadLibrary(){
    const r = await apiFetch("/userbooks/", { headers: {...authHeaders() }});
    if(r.ok) setLibrary(Array.isArray(r.data) ? r.data : []);
    else if(r.status===401) setMsg("Please login to view your library");
  }
  async function loadFeed(){
    const r = await apiFetch("/notes/feed", { headers: {...authHeaders() }});
    if(r.ok) setFeed(Array.isArray(r.data)? r.data: []);
  }

  async function addToLibrary(bookId){
    const token = localStorage.getItem("bt_token");
    if(!token){ alert("Login first"); return; }
    const r = await apiFetch("/userbooks/", { method: "POST", headers: { "Content-Type":"application/json", ...authHeaders() }, body: JSON.stringify({ book_id: bookId, status: "to-read", current_page: 0 }) });
    if(r.ok){ setMsg("Added to library"); loadLibrary(); } else setMsg("Failed to add");
  }

  function logout(){ localStorage.removeItem("bt_token"); setUser(null); setRoute("books"); setMsg("Logged out"); }

  return (
    <div style={styles.app}>
      <Header user={user} onRoute={setRoute} onLogout={logout} route={route} />
      <div style={styles.container}>
        <Sidebar route={route} />
        <main style={styles.main}>
          {msg && <div style={styles.alert}>{msg}</div>}
          {route==="signup" && <AuthForm type="signup" onSuccess={(token,u)=>{ localStorage.setItem("bt_token", token); setUser(u||{}); setRoute("books"); setMsg("Signed up"); }} />}
          {route==="login" && <AuthForm type="login" onSuccess={(token,u)=>{ localStorage.setItem("bt_token", token); setUser(u||{}); setRoute("books"); setMsg("Logged in"); }} />}
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
          {route==="follow" && <FollowPanel onMessage={setMsg} />}
          {route==="profile" && <Profile setMsg={setMsg} />}
        </main>
      </div>
    </div>
  );
}
