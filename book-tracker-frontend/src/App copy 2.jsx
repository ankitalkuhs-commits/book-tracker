/*
BookPulse Dashboard UI (single-file React component)

Usage:
1) Create a Vite React project (or use an existing one):
   npm create vite@latest bookpulse-ui -- --template react
   cd bookpulse-ui
2) Install TailwindCSS (recommended) or you can use the included inline styles.
   This component is written to use Tailwind utility classes. If Tailwind isn't set up,
   the layout still works but will require CSS adjustments.

3) Replace src/App.jsx with this file contents and run:
   npm install
   npm run dev

What this file contains:
- A polished dashboard UI with: top navigation, composer (post input), community feed cards,
  right-hand sidebar (currently reading, weekly pulse, community highlights).
- Mock data and interactions (like, comment counters, basic post composition UI) so you can
  see how it behaves. No backend integration is included — this is pure frontend for UI prototyping.

Notes:
- Uses Tailwind for styling. If you prefer plain CSS, let me know and I can provide a CSS version.
- Replace placeholder images with your own or wire up the backend image URLs.
*/

import React, { useState } from "react";

export default function App() {
  const [posts, setPosts] = useState(initialPosts);
  const [composerText, setComposerText] = useState("");
  const [composerImage, setComposerImage] = useState(null);

  function handlePostShare() {
    if (!composerText && !composerImage) return;
    const newPost = {
      id: Date.now(),
      user: sampleUser,
      book: { title: "The Alchemist", author: "Paulo Coelho" },
      emotion: "serene",
      text: composerText,
      image: composerImage,
      likes: 0,
      comments: 0,
      createdAt: new Date().toISOString(),
    };
    setPosts([newPost, ...posts]);
    setComposerText("");
    setComposerImage(null);
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setComposerImage(ev.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-12 gap-6">
        {/* main column */}
        <div className="col-span-8">
          <Composer
            text={composerText}
            onChangeText={setComposerText}
            onImageChange={handleImageUpload}
            imagePreview={composerImage}
            onShare={handlePostShare}
          />

          <div className="mt-6 space-y-6">
            <h3 className="text-xl font-semibold">Community Pulse</h3>
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </div>

        {/* sidebar */}
        <aside className="col-span-4 space-y-6">
          <Card>
            <h4 className="font-semibold mb-3">Currently Reading</h4>
            <div className="space-y-3">
              <ReadingItem title="Dune" author="Frank Herbert" progress={75} img={cover1} />
              <ReadingItem title="The Midnight Library" author="Matt Haig" progress={42} img={cover2} />
            </div>
          </Card>

          <Card>
            <h4 className="font-semibold mb-3">Your Weekly Pulse</h4>
            <BarSpark data={[2, 3, 1, 4, 5, 3, 4]} />
          </Card>

          <Card>
            <h4 className="font-semibold mb-3">Community Highlights</h4>
            <div className="text-sm text-gray-600 space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  <div className="text-gray-900">Top Emotional Books</div>
                  <ol className="mt-1 list-inside list-decimal text-sm text-gray-600">
                    <li>The Song of Achilles <span className="ml-2 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">Sadness</span></li>
                    <li>Circe <span className="ml-2 px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700">Inspired</span></li>
                    <li>Atomic Habits <span className="ml-2 px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Hope</span></li>
                  </ol>
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function TopNav() {
  return (
    <header className="bg-white border-b">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-indigo-700 font-semibold text-lg flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
            </svg>
            BookPulse
          </div>
          <nav className="hidden md:flex items-center gap-4 text-sm text-gray-600">
            <a className="hover:text-gray-900">Home</a>
            <a className="hover:text-gray-900">Explore</a>
            <a className="hover:text-gray-900">Community</a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm">+ Add Book</button>
          <img src={avatar} className="w-9 h-9 rounded-full border" alt="avatar" />
        </div>
      </div>
    </header>
  );
}

function Composer({ text, onChangeText, onImageChange, imagePreview, onShare }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm">
      <div className="flex gap-3">
        <img src={avatar} className="w-12 h-12 rounded-full" alt="user" />
        <div className="flex-1">
          <textarea value={text} onChange={(e) => onChangeText(e.target.value)} placeholder="What are you feeling from your read?" className="w-full border rounded-md p-3 text-sm min-h-[80px] resize-none" />

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7" /></svg>
                <input type="file" accept="image/*" onChange={onImageChange} className="hidden" />
                <span>Photo</span>
              </label>
              <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100">Quote</button>
              <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100">Emoji</button>
            </div>
            <div>
              <button onClick={onShare} className="bg-indigo-600 text-white px-4 py-2 rounded-md">Share Pulse</button>
            </div>
          </div>

          {imagePreview && (
            <div className="mt-3">
              <img src={imagePreview} alt="preview" className="w-full rounded-md max-h-56 object-cover" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({ post }) {
  return (
    <article className="bg-white p-4 rounded-lg shadow-sm">
      <div className="flex items-start gap-3">
        <img src={post.user.avatar || avatar} className="w-12 h-12 rounded-full" alt="author" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{post.user.name} <span className="text-indigo-600">felt {post.emotion}</span> reading</div>
              <div className="text-xs text-gray-500">{post.book.title}</div>
            </div>
            <div className="text-xs text-gray-400">2 hours ago</div>
          </div>

          <div className="mt-3 text-gray-800">{post.text}</div>

          {post.image && (
            <img src={post.image} alt="post" className="mt-3 w-full rounded-md object-cover max-h-72" />
          )}

          <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9l-3 3m0 0l-3-3m3 3V4" /></svg>
              <span>{post.likes}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8-1.2 0-2.35-.18-3.4-.5L3 20l1.1-3.3C3.43 15.9 3 14.98 3 14c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <span>{post.comments}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Card({ children }) {
  return <div className="bg-white p-4 rounded-lg shadow-sm">{children}</div>;
}

function ReadingItem({ title, author, progress = 0, img }) {
  return (
    <div className="flex items-center gap-3">
      <img src={img} className="w-12 h-16 rounded-sm object-cover" alt="cover" />
      <div className="flex-1">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-gray-500">{author}</div>
        <div className="mt-2 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function BarSpark({ data = [] }) {
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex items-end">
          <div className="w-full rounded-t bg-gradient-to-b from-indigo-300 to-indigo-500" style={{ height: `${d * 16}px` }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Mock data & assets ---------- */
const avatar = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop&ixlib=rb-4.0.3&s=4d4a1f3a1d5f7b2f1b3f2a3e6c7d8e9f";
const cover1 = "https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=400&auto=format&fit=crop&ixlib=rb-4.0.3&s=bd9f1c8d2c6f3c6b4d6a2e1f1c9a8a7b";
const cover2 = "https://images.unsplash.com/photo-1496104679561-38b2f8e5a9a8?q=80&w=400&auto=format&fit=crop&ixlib=rb-4.0.3&s=3b6c9a2f5e6a4b1c2d3e4f5a6b7c8d9e";

const sampleUser = { id: 1, name: "Ankit", avatar };

const initialPosts = [
  {
    id: 1,
    user: { name: "Ankit", avatar },
    book: { title: "The Alchemist", author: "Paulo Coelho" },
    emotion: "serene",
    text: `"When you want something, all the universe conspires in helping you to achieve it." This line always brings me a sense of peace and destiny. A perfect reminder on a chaotic day.`,
    image: "https://images.unsplash.com/photo-1508057198894-247b23fe5ade?q=80&w=1200&auto=format&fit=crop&ixlib=rb-4.0.3&s=9b7a5f6c1d2e3f4a5b6c7d8e9f0a1b2c",
    likes: 128,
    comments: 12,
    createdAt: "2 hours ago",
  },
  {
    id: 2,
    user: { name: "Chloe", avatar },
    book: { title: "Educated", author: "Tara Westover" },
    emotion: "inspired",
    text: `"The decisions I made after that moment were not the ones she would have made. They were the choices of a changed person, a new self." Tara's journey is a powerful testament to resilience.`,
    image: null,
    likes: 302,
    comments: 45,
    createdAt: "5 hours ago",
  },
];
