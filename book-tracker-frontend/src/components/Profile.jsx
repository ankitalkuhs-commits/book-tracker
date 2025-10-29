// src/components/Profile.jsx
import React, { useEffect, useState } from "react";
import { apiFetch, authHeaders } from "../services/api";
import { styles } from "../styles";

/*
  Profile component
  Props:
    - setMsg(msg): optional callback to show app-level messages
*/
export default function Profile({ setMsg }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    const r = await apiFetch("/profile/me", { headers: { ...authHeaders() } });
    setLoading(false);
    if (r.ok) {
      setProfile(r.data);
      setName(r.data?.name || "");
      setBio(r.data?.bio || "");
    } else {
      setMsg?.("Unable to load profile");
    }
  }

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    const r = await apiFetch("/profile/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, bio }),
    });
    setLoading(false);
    if (r.ok) {
      setProfile(r.data);
      setEditing(false);
      setMsg?.("Profile updated");
    } else {
      setMsg?.("Update failed");
    }
  }

  if (loading && !profile) return <div>Loading profile...</div>;
  if (!profile) return <div style={{ padding: 12 }}>No profile available.</div>;

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>{profile.name}</h2>
            <div style={{ color: "#666" }}>{profile.email}</div>
            <div style={{ color: "#666", fontSize: "0.9em" }}>
              Member since {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : ""}
            </div>
          </div>
          <button style={styles.smallBtn} onClick={() => setEditing(!editing)}>
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing ? (
          <form onSubmit={save} style={{ marginTop: 12 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} style={styles.textarea} />
            <button style={styles.btn} disabled={loading}>{loading ? "Saving..." : "Save"}</button>
          </form>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p style={{ color: "#4a5568" }}>{profile.bio || <em>No bio yet</em>}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginTop: 18 }}>
              <div style={styles.card}>
                <div style={{ fontSize: "1.4em", fontWeight: 700 }}>{profile.stats?.total_books ?? 0}</div>
                <div style={{ color: "#6b7280" }}>Total Books</div>
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: "1.4em", fontWeight: 700 }}>{profile.stats?.finished ?? 0}</div>
                <div style={{ color: "#6b7280" }}>Finished</div>
              </div>
              <div style={styles.card}>
                <div style={{ fontSize: "1.4em", fontWeight: 700 }}>{profile.followers_count ?? 0}</div>
                <div style={{ color: "#6b7280" }}>Followers</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
