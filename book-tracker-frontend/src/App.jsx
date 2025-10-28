/*
Frontend single-file React app (App.jsx) for Book Tracker POC

How to use:
1) Create a Vite React app (windows PowerShell):
   npm create vite@latest book-tracker-frontend -- --template react
   cd book-tracker-frontend
2) Replace src/App.jsx with the contents of this file (copy from the code area below into src/App.jsx)
3) Replace src/main.css (or import this file's CSS into main) or keep default styles. This file uses inline styles so no Tailwind required.
4) Run:
   npm install
   npm run dev

Open http://localhost:5173 and the app should connect to the backend at http://127.0.0.1:8000

Notes:
- The app uses fetch() to call backend endpoints. It expects JWT tokens returned on signup/login.
- Tokens are saved in localStorage under 'bt_token'.
- You can change BACKEND_URL if your API runs elsewhere.

This single-file contains a compact UI with: Signup, Login, Book List, Add Book, My Library, Add Note, Follow, Feed.

*/

// Import required tools from React to build our app
import React, { useEffect, useState } from "react";

// The address where our backend server is running
// This is where all our data is stored and processed
const BACKEND = "http://127.0.0.1:8000";

// Helper function to handle user authentication
// When a user logs in, we store their login token and use it for future requests
// This is like showing your ID card to prove you're allowed to access certain features
function authHeaders() {
  const token = localStorage.getItem("bt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Helper function to make it easier to talk to our backend server
// This is like a standardized way to send messages to and receive responses from the server
// It handles both successful responses and errors in a consistent way
function useFetch(endpoint, opts = {}) {
  const url = BACKEND + endpoint;
  return fetch(url, opts).then(async (res) => {
    const txt = await res.text();
    try { return { ok: res.ok, data: JSON.parse(txt), status: res.status }; } catch (e) { return { ok: res.ok, data: txt, status: res.status }; }
  });
}

// Main App Component - This is the heart of our application
// It manages all the main features and coordinates between different parts of the app
export default function App() {
  // These are like variables that can change and update what we see on screen
  const [route, setRoute] = useState("books");     // Which page we're currently viewing
  const [user, setUser] = useState(null);          // Information about the logged-in user
  const [books, setBooks] = useState([]);          // List of all books in the system
  const [library, setLibrary] = useState([]);      // User's personal book collection
  const [feed, setFeed] = useState([]);           // Social feed showing updates from other users
  const [msg, setMsg] = useState(null);           // Messages to show to the user (like notifications)

  // List of success messages that should disappear automatically after a few seconds
  // This helps keep the interface clean and uncluttered
  const autoDismissMessages = [
    "Logged in",
    "Signed up",
    "Book added",
    "Note added",
    "Followed!"
  ];

  // Automatically hide success messages after 5 seconds
  // This keeps the interface clean by removing temporary notifications
  useEffect(() => {
    if (msg && autoDismissMessages.includes(msg)) {
      const timer = setTimeout(() => {
        setMsg(null);
      }, 5000);
      // Clean up the timer if the component is unmounted
      return () => clearTimeout(timer);
    }
  }, [msg]);

  // Check if user was previously logged in when app starts
  // If we find a login token, we consider the user as logged in
  useEffect(() => {
    const token = localStorage.getItem("bt_token");
    if (token) {
      setUser({});
    }
  }, []);

  // Auto-refresh system to keep all data up to date
  // This automatically updates the current page's content every 10 seconds
  useEffect(() => {
    // Clear old messages when changing pages
    setMsg(null);

    // Function to load data based on which page we're viewing
    const loadCurrentRoute = () => {
      switch (route) {
        case "books":
          loadBooks();    // Refresh the book list
          break;
        case "library":
          loadLibrary();  // Refresh user's personal library
          break;
        case "feed":
          loadFeed();     // Refresh social feed
          break;
        case "profile":
          // Profile updates itself when needed
          break;
      }
    };

    // Load data immediately when page changes
    loadCurrentRoute();

    // Set up automatic refresh every 10 seconds
    const refreshInterval = setInterval(loadCurrentRoute, 10000);

    // Clean up the refresh timer when changing pages
    return () => clearInterval(refreshInterval);
  }, [route]);

  // Function to load the list of all books from the server
  // This gets called when viewing the main books page and during auto-refresh
  async function loadBooks() {
    const r = await useFetch("/books/");
    if (r.ok) setBooks(r.data);
  }

  // Function to load the user's personal library
  // This includes books they're reading, want to read, or have finished
  async function loadLibrary() {
    const r = await useFetch("/userbooks", { headers: { ...authHeaders() } });
    if (r.ok) setLibrary(r.data);
    else if (r.status === 401) setMsg("Please login to view your library");
  }

  // Function to load the social feed
  // This shows updates from other users like new books, notes, and reading progress
  async function loadFeed() {
    const r = await useFetch("/notes/feed", { headers: { ...authHeaders() } });
    if (r.ok) setFeed(r.data);
    else if (r.status === 401) setMsg("Please login to view feed");
  }

  // Function to handle user logout
  // Removes the login token and clears user data from the app
  function logout() {
    localStorage.removeItem("bt_token");
    setUser(null);
    setMsg("Logged out");
  }

  // The main layout of our application
  return (
    <div style={styles.app}>
      {/* Top navigation bar with links */}
      <Header user={user} onRoute={setRoute} onLogout={logout} route={route} />
      
      <div style={styles.container}>
        {/* Sidebar with quick filters and navigation options */}
        <Sidebar route={route} onRoute={setRoute} />
        
        {/* Main content area */}
        <main style={styles.main}>
          {/* Show any active messages/notifications */}
          {msg && <div style={styles.alert}>{msg}</div>}

          {/* Sign up form - shown when route is "signup" */}
          {route === "signup" && (
            <AuthForm 
              type="signup" 
              onSuccess={(token, u) => { 
                localStorage.setItem("bt_token", token); // Save login token
                setUser(u);                             // Set user info
                setRoute("books");                      // Go to books page
                setMsg("Signed up");                    // Show success message
              }} 
            />
          )}

          {/* Login form - shown when route is "login" */}
          {route === "login" && (
            <AuthForm 
              type="login" 
              onSuccess={(token, u) => { 
                localStorage.setItem("bt_token", token); // Save login token
                setUser(u);                             // Set user info
                setRoute("books");                      // Go to books page
                setMsg("Logged in");                    // Show success message
              }} 
            />
          )}

          {route === "books" && (
            <div>
              <h2>All Books</h2>
              <BookList books={books} />
              <AddBook onAdded={() => { loadBooks(); setMsg("Book added"); }} />
            </div>
          )}

          {route === "library" && (
            <div>
              <h2>My Library</h2>
              <UserLibrary items={library} onRefresh={loadLibrary} setMsg={setMsg} />
            </div>
          )}

          {route === "feed" && (
            <div>
              <h2>Feed</h2>
              <Feed items={feed} />
            </div>
          )}

          {route === "follow" && (
            <FollowPanel onMessage={setMsg} />
          )}

          {route === "profile" && (
            <Profile setMsg={setMsg} />
          )}

        </main>
      </div>
    </div>
  );
}

// Profile Component - Shows and manages user profile information
// This component handles displaying and editing user details, reading stats, and social info
function Profile({ setMsg }) {
  // Store profile data and form states
  const [profile, setProfile] = useState(null);        // Full profile data
  const [isEditing, setIsEditing] = useState(false);   // Whether we're in edit mode
  const [name, setName] = useState("");                // Name input field
  const [bio, setBio] = useState("");                  // Bio input field

  // Load profile data when the component first appears
  useEffect(() => {
    loadProfile();
  }, []);

  // Function to fetch the user's profile from the server
  async function loadProfile() {
    const r = await useFetch('/profile/me', {
      headers: { ...authHeaders() }
    });
    if (r.ok) {
      setProfile(r.data);                // Store the full profile
      setName(r.data.name);             // Set the name field
      setBio(r.data.bio || '');         // Set the bio field (use empty string if no bio)
    }
  }

  // Function to save profile changes
  // This runs when the edit form is submitted
  async function updateProfile(e) {
    e.preventDefault();  // Prevent the form from submitting normally
    const r = await useFetch('/profile/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({ name, bio })  // Send updated name and bio to server
    });
    if (r.ok) {
      setProfile(r.data);                     // Update displayed profile
      setMsg('Profile updated successfully');  // Show success message
      setIsEditing(false);                    // Exit edit mode
    } else {
      setMsg('Error updating profile');        // Show error message
    }
  }

  if (!profile) return <div>Loading profile...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0' }}>{profile.name}</h2>
            <div style={{ color: '#666', marginBottom: 8 }}>{profile.email}</div>
            <div style={{ color: '#666', fontSize: '0.9em' }}>
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </div>
          </div>
          <button 
            onClick={() => setIsEditing(!isEditing)} 
            style={styles.smallBtn}
          >
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={updateProfile}>
            <div>
              <input
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                style={styles.input}
              />
            </div>
            <div>
              <textarea
                placeholder="Bio"
                value={bio}
                onChange={e => setBio(e.target.value)}
                style={styles.textarea}
              />
            </div>
            <button style={styles.btn}>Save Changes</button>
          </form>
        ) : (
          <div style={{ marginBottom: 24 }}>
            {profile.bio ? (
              <p style={{ color: '#4a5568', lineHeight: 1.6 }}>{profile.bio}</p>
            ) : (
              <p style={{ color: '#a0aec0', fontStyle: 'italic' }}>No bio added yet</p>
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid #edf2f7', paddingTop: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Reading Stats</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <div style={styles.statCard}>
              <div style={{ fontSize: '2em', fontWeight: '600', color: '#2b6cb0' }}>{profile.stats.total_books}</div>
              <div style={{ color: '#4a5568' }}>Total Books</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ fontSize: '2em', fontWeight: '600', color: '#2c7a4b' }}>{profile.stats.finished}</div>
              <div style={{ color: '#4a5568' }}>Finished</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ fontSize: '2em', fontWeight: '600', color: '#2b6cb0' }}>{profile.stats.reading}</div>
              <div style={{ color: '#4a5568' }}>Currently Reading</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ fontSize: '2em', fontWeight: '600', color: '#4a5568' }}>{profile.stats.to_read}</div>
              <div style={{ color: '#4a5568' }}>To Read</div>
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: '1.2em', fontWeight: '600' }}>{profile.followers_count}</div>
              <div style={{ color: '#4a5568' }}>Followers</div>
            </div>
            <div>
              <div style={{ fontSize: '1.2em', fontWeight: '600' }}>{profile.following_count}</div>
              <div style={{ color: '#4a5568' }}>Following</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Header Component - The top navigation bar of our application
// Shows the app title and navigation buttons, changes based on whether user is logged in
function Header({ user, onRoute, onLogout, route }) {
  // Helper function to style the navigation buttons
  // Makes the current page's button look different (highlighted)
  const getLinkStyle = (buttonRoute) => ({
    ...styles.link,
    ...(route === buttonRoute ? styles.activeLink : {})
  });

  return (
    <header style={styles.header}>
      {/* App title - clicking it takes you to the books page */}
      <h1 style={{cursor:'pointer'}} onClick={() => onRoute('books')}>Book Tracker</h1>
      
      {/* Navigation menu */}
      <nav>
        {/* Main navigation buttons - always visible */}
        <button style={getLinkStyle('books')} onClick={() => onRoute('books')}>Books</button>
        <button style={getLinkStyle('library')} onClick={() => onRoute('library')}>My Library</button>
        <button style={getLinkStyle('feed')} onClick={() => onRoute('feed')}>Feed</button>
        <button style={getLinkStyle('follow')} onClick={() => onRoute('follow')}>Follow</button>
        
        {/* Show different buttons based on login status */}
        {!localStorage.getItem('bt_token') ? (
          // Show these buttons when user is NOT logged in
          <>
            <button style={getLinkStyle('login')} onClick={() => onRoute('login')}>Login</button>
            <button style={getLinkStyle('signup')} onClick={() => onRoute('signup')}>Signup</button>
          </>
        ) : (
          // Show these buttons when user IS logged in
          <>
            <button style={getLinkStyle('profile')} onClick={() => onRoute('profile')}>Profile</button>
            <button style={styles.link} onClick={onLogout}>Logout</button>
          </>
        )}
      </nav>
    </header>
  );
}

// Sidebar Component - Shows quick filters for the current page
// Changes the filter options based on which page you're viewing
function Sidebar({ route }) {
  return (
    <aside style={styles.sidebar}>
      {/* Sidebar title */}
      <h3 style={{margin: '0 0 12px 0', fontSize: '1.1em', color: '#4a5568'}}>Quick Filters</h3>
      
      {/* Decorative line */}
      <div style={{borderBottom: '1px solid #eee', marginBottom: '12px'}}></div>
      
      {/* Show different filter options for each page */}
      {/* Main Books Page Filters */}
      {route === 'books' && (
        <ul style={{listStyle:'none', padding:0}}>
          <li><button style={styles.filterBtn}>All</button></li>
          <li><button style={styles.filterBtn}>Recently Added</button></li>
          <li><button style={styles.filterBtn}>Most Popular</button></li>
        </ul>
      )}

      {/* My Library Page Filters */}
      {route === 'library' && (
        <ul style={{listStyle:'none', padding:0}}>
          <li><button style={styles.filterBtn}>All Books</button></li>
          <li><button style={styles.filterBtn}>Currently Reading</button></li>
          <li><button style={styles.filterBtn}>Finished</button></li>
          <li><button style={styles.filterBtn}>To Read</button></li>
        </ul>
      )}

      {/* Social Feed Page Filters */}
      {route === 'feed' && (
        <ul style={{listStyle:'none', padding:0}}>
          <li><button style={styles.filterBtn}>All Updates</button></li>
          <li><button style={styles.filterBtn}>Notes</button></li>
          <li><button style={styles.filterBtn}>New Books</button></li>
          <li><button style={styles.filterBtn}>Finished Books</button></li>
        </ul>
      )}
    </aside>
  );
}

// BookList Component - Displays the list of all books in the system
// Shows books in a grid with pagination (showing a few books per page)
function BookList({ books = [] }) {
  // Keep track of which page of books we're viewing
  const [currentPage, setCurrentPage] = useState(1);
  
  // Calculate how many pages we need to show all books
  const totalPages = Math.ceil(books.length / ITEMS_PER_PAGE);
  
  // Calculate which books to show on the current page
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const displayedBooks = books.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Function to handle page changes
  // Also scrolls to top when changing pages for better user experience
  function changePage(pageNum) {
    setCurrentPage(pageNum);
    window.scrollTo(0, 0);
  }

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16}}>
        <div style={{color: '#666'}}>
          Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, books.length)} of {books.length} books
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16, marginTop:12}}>
        {displayedBooks.map(b => (
          <div key={b.id} style={styles.card}>
            <div style={{display: 'flex', gap: '12px'}}>
              {b.cover_url && (
                <img src={b.cover_url} alt={b.title} style={{width: 80, height: 120, objectFit: 'cover'}} />
              )}
              <div style={{flex: 1}}>
                <h3 style={{margin: '0 0 8px 0'}}>{b.title}</h3>
                <div style={{fontSize: '0.9em', color: '#555', marginBottom: '8px'}}>
                  {b.author || 'Unknown Author'}
                </div>
                {b.description && (
                  <div style={{fontSize: '0.9em', color: '#666', marginBottom: '8px'}}>
                    {truncateText(b.description, 150)}
                  </div>
                )}
                {b.total_pages && (
                  <div style={{fontSize: '0.8em', color: '#666'}}>
                    Pages: {b.total_pages}
                  </div>
                )}
              </div>
            </div>
            <div style={{marginTop:12}}>
              <button onClick={async()=>{
                const token = localStorage.getItem('bt_token');
                if(!token){ alert('Login first'); return; }
                
                const bookId = Number(b.id);
                if(isNaN(bookId)){ 
                  alert('Invalid book ID'); 
                  return; 
                }
                
                try {
                  const res = await useFetch('/userbooks', {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      ...authHeaders()
                    },
                    body: JSON.stringify({
                      book_id: bookId,
                      status: 'to-read'
                    })
                  });
                  
                  if(res.ok) {
                    alert('Added to library');
                  } else {
                    alert('Error: ' + (res.data.detail || JSON.stringify(res.data)));
                  }
                } catch (error) {
                  console.error('Error:', error);
                  alert('Error: ' + error.message);
                }
              }} style={styles.smallBtn}>Add to Library</button>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button 
            onClick={() => changePage(currentPage - 1)} 
            disabled={currentPage === 1}
            style={{...styles.pageBtn, opacity: currentPage === 1 ? 0.5 : 1}}
          >
            Previous
          </button>
          {Array.from({length: totalPages}, (_, i) => i + 1).map(num => (
            <button
              key={num}
              onClick={() => changePage(num)}
              style={{
                ...styles.pageBtn,
                ...(num === currentPage ? styles.activePageBtn : {})
              }}
            >
              {num}
            </button>
          ))}
          <button 
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={{...styles.pageBtn, opacity: currentPage === totalPages ? 0.5 : 1}}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// AddBook Component - Form to add new books to the system
// Includes Google Books search integration for easy book adding
function AddBook({ onAdded }) {
  // Search-related states
  const [searchQuery, setSearchQuery] = useState("");        // What user is searching for
  const [searchResults, setSearchResults] = useState([]);    // Results from Google Books
  const [loading, setLoading] = useState(false);            // Whether search is in progress
  const [selectedBook, setSelectedBook] = useState(null);    // Book chosen from search results

  // Form field states for book details
  const [title, setTitle] = useState("");                   // Book title
  const [author, setAuthor] = useState("");                 // Book author(s)
  const [isbn, setIsbn] = useState("");                     // ISBN number
  const [desc, setDesc] = useState("");                     // Book description
  const [totalPages, setTotalPages] = useState("");         // Number of pages
  const [publisher, setPublisher] = useState("");           // Publisher name
  const [publishedDate, setPublishedDate] = useState("");   // Publication date
  const [coverUrl, setCoverUrl] = useState("");             // Book cover image URL

  async function searchBooks(query) {
    if (!query) return;
    setLoading(true);
    setSearchResults([]); // Clear previous results
    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.items) {
        setSearchResults(data.items);
      } else {
        console.log('No books found');
      }
    } catch (error) {
      console.error('Error searching books:', error);
      alert('Error searching books. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function selectBook(book) {
    const volumeInfo = book.volumeInfo;
    setSelectedBook(book);
    setTitle(volumeInfo.title || "");
    setAuthor(volumeInfo.authors ? volumeInfo.authors.join(", ") : "");
    setIsbn(volumeInfo.industryIdentifiers ? 
      volumeInfo.industryIdentifiers.find(id => id.type === "ISBN_13")?.identifier || 
      volumeInfo.industryIdentifiers[0]?.identifier || "" : "");
    setDesc(volumeInfo.description || "");
    setTotalPages(volumeInfo.pageCount || "");
    setPublisher(volumeInfo.publisher || "");
    setPublishedDate(volumeInfo.publishedDate || "");
    setCoverUrl(volumeInfo.imageLinks?.thumbnail || "");
    setSearchResults([]); // Clear search results
    setSearchQuery(""); // Clear search query
  }

  async function submit(e){
    e.preventDefault();
    const token = localStorage.getItem('bt_token');
    if(!token){ alert('Login first'); return; }
    const r = await useFetch('/books', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({
        title,
        author,
        isbn,
        description: desc,
        total_pages: totalPages ? parseInt(totalPages) : null,
        publisher,
        published_date: publishedDate,
        cover_url: coverUrl
      })
    });
    if(r.ok){ 
      setTitle(''); 
      setAuthor(''); 
      setIsbn(''); 
      setDesc('');
      setTotalPages('');
      setPublisher('');
      setPublishedDate('');
      setCoverUrl('');
      setSelectedBook(null);
      onAdded(); 
    } else {
      alert('Error: ' + (r.data.detail || JSON.stringify(r.data)));
    }
  }

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        searchBooks(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  return (
    <form onSubmit={submit} style={{marginTop:20}}>
      <h3>Add Book</h3>
      <div style={{marginBottom: 16}}>
        <input 
          placeholder="Search for a book..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)}
          style={styles.input}
        />
        {loading && <div style={{color: '#666'}}>Searching...</div>}
        {searchResults.length > 0 && (
          <div style={{...styles.card, marginTop: 8}}>
            {searchResults.map(book => (
              <div 
                key={book.id} 
                onClick={() => selectBook(book)}
                style={{
                  padding: 8,
                  cursor: 'pointer',
                  ':hover': { background: '#f7fafc' },
                  borderBottom: '1px solid #edf2f7'
                }}
              >
                <div style={{fontWeight: 500}}>{book.volumeInfo.title}</div>
                <div style={{fontSize: '0.9em', color: '#666'}}>
                  {book.volumeInfo.authors?.join(", ")} ({book.volumeInfo.publishedDate?.split("-")[0]})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {selectedBook && coverUrl && (
        <div style={{marginBottom: 16}}>
          <img src={coverUrl} alt="Book cover" style={{maxHeight: 200}} />
        </div>
      )}

      <div><input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} required style={styles.input} /></div>
      <div><input placeholder="Author" value={author} onChange={e=>setAuthor(e.target.value)} style={styles.input} /></div>
      <div><input placeholder="ISBN" value={isbn} onChange={e=>setIsbn(e.target.value)} style={styles.input} /></div>
      <div><input placeholder="Total Pages" type="number" value={totalPages} onChange={e=>setTotalPages(e.target.value)} style={styles.input} /></div>
      <div><input placeholder="Publisher" value={publisher} onChange={e=>setPublisher(e.target.value)} style={styles.input} /></div>
      <div><input placeholder="Published Date" value={publishedDate} onChange={e=>setPublishedDate(e.target.value)} style={styles.input} /></div>
      <div><textarea placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)} style={styles.textarea}></textarea></div>
      <button style={styles.btn}>Add Book</button>
    </form>
  );
}

// AuthForm Component - Handles both login and signup
// This is a flexible form that changes based on whether user is logging in or signing up
function AuthForm({ type='login', onSuccess }){
  // Form field states
  const [name,setName] = useState('');       // Only used for signup
  const [email,setEmail] = useState('');     // Used for both login and signup
  const [password,setPassword] = useState(''); // Used for both login and signup

  // Handle form submission for both login and signup
  async function submit(e){
    e.preventDefault(); // Prevent normal form submission
    
    // Choose the right endpoint and data based on whether it's login or signup
    const endpoint = type === 'signup' ? '/auth/signup' : '/auth/login';
    const body = type === 'signup' ? {name, email, password} : {email, password};
    
    // Send request to server
    const res = await fetch(BACKEND + endpoint, {
      method:'POST', 
      headers:{ 'Content-Type':'application/json' }, 
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    if(res.ok){ 
      onSuccess(data.access_token, data.user); // Handle successful login/signup
    } else { 
      alert('Error: '+(data.detail||JSON.stringify(data))); // Show error message
    }
  }

  return (
    <form onSubmit={submit} style={{maxWidth:420}}>
      <h3>{type === 'signup' ? 'Create account' : 'Login'}</h3>
      {type === 'signup' && <div><input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} required style={styles.input} /></div>}
      <div><input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required style={styles.input} /></div>
      <div><input placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} type="password" required style={styles.input} /></div>
      <button style={styles.btn}>{type === 'signup' ? 'Sign up' : 'Login'}</button>
    </form>
  );
}

// UserLibrary Component - Shows the user's personal book collection
// Displays books they're reading, want to read, or have finished, along with notes
function UserLibrary({ items = [], setMsg }){
  // Track which book's notes are being shown
  const [expandedBookId, setExpandedBookId] = useState(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const displayedItems = items.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Handle page changes in the library
  // Also closes any expanded notes section for cleaner navigation
  function changePage(pageNum) {
    setCurrentPage(pageNum);
    setExpandedBookId(null); // Close any expanded notes when changing pages
    window.scrollTo(0, 0);   // Scroll back to top of page
  }

  async function addNote(userbook_id){
    const text = prompt('Write a quick note');
    if(!text) return;
    const is_public = confirm('Make this note public? OK = yes');
    const token = localStorage.getItem('bt_token');
    const res = await fetch(BACKEND + '/notes', {method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({userbook_id, text, is_public})});
    const data = await res.json();
    if(res.ok) { 
      setMsg('Note added');
      // If this book's notes are currently expanded, refresh them
      if (expandedBookId === userbook_id) {
        setExpandedBookId(null);
        setTimeout(() => setExpandedBookId(userbook_id), 100);
      }
    } else setMsg('Error: '+(data.detail||JSON.stringify(data)));
  }

  function getStatusBadgeStyle(status) {
    const baseStyle = {
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '0.85em',
      fontWeight: '500'
    };

    switch(status) {
      case 'reading':
        return { ...baseStyle, backgroundColor: '#ebf5ff', color: '#2b6cb0' };
      case 'finished':
        return { ...baseStyle, backgroundColor: '#e6ffed', color: '#2c7a4b' };
      default: // 'to-read'
        return { ...baseStyle, backgroundColor: '#f3f4f6', color: '#4b5563' };
    }
  }

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16}}>
        <div style={{color: '#666'}}>
          Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, items.length)} of {items.length} books
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16}}>
        {displayedItems.map(u=> (
          <div key={u.id} style={styles.card}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <h3 style={{margin: '0 0 8px 0'}}>{u.book.title}</h3>
              <div style={getStatusBadgeStyle(u.status)}>{u.status}</div>
            </div>
            <div style={{fontSize: '0.9em', color: '#555', marginBottom: '12px'}}>
              <strong>Author:</strong> {u.book.author || 'Not specified'}
            </div>
            {u.book.description && (
              <div style={{fontSize: '0.9em', margin: '8px 0', color: '#666'}}>
                <strong>Description:</strong><br/>
                {truncateText(u.book.description, 150)}
              </div>
            )}
            <div style={{fontSize: '0.9em', color: '#666', marginBottom: '12px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <strong>Current page:</strong>
                <input 
                  type="number" 
                  defaultValue={u.current_page || ''} 
                  placeholder="0"
                  min="0"
                  style={{...styles.input, width: '70px', margin: '0'}}
                  onBlur={async (e) => {
                    const newPage = parseInt(e.target.value);
                    if (newPage === u.current_page) return;
                    
                    const token = localStorage.getItem('bt_token');
                    const res = await fetch(BACKEND + '/userbooks/' + u.id, {
                      method: 'PATCH',
                      headers: { 
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({ current_page: newPage })
                    });
                    
                    if (res.ok) {
                      setMsg('Page updated');
                      onRefresh();
                    } else {
                      setMsg('Error updating page');
                      e.target.value = u.current_page || '';
                    }
                  }}
                />
              </div>
            </div>
            <div style={{marginTop: '16px', display: 'flex', gap: '8px'}}>
              <button onClick={()=>addNote(u.id)} style={styles.smallBtn}>Add Note</button>
              <button 
                onClick={() => setExpandedBookId(expandedBookId === u.id ? null : u.id)} 
                style={styles.smallBtn}
              >
                {expandedBookId === u.id ? 'Hide Notes' : 'Show Notes'}
              </button>
              {u.status !== 'finished' && (
                <button 
                  onClick={async()=>{ 
                    const token=localStorage.getItem('bt_token'); 
                    await fetch(BACKEND + '/userbooks/'+u.id, {
                      method:'PATCH', 
                      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, 
                      body: JSON.stringify({status:'finished'})
                    }); 
                    onRefresh(); 
                  }} 
                  style={styles.smallBtn}
                >
                  Mark Finished
                </button>
              )}
            </div>
            {expandedBookId === u.id && (
              <BookNotes 
                userbook_id={u.id} 
                onRefresh={() => {
                  setExpandedBookId(null);
                  setTimeout(() => setExpandedBookId(u.id), 100);
                }} 
                setMsg={setMsg} 
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BookNotes({ userbook_id, onRefresh, setMsg }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState(null);
  const [editedText, setEditedText] = useState("");
  const [editedIsPublic, setEditedIsPublic] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [userbook_id]);

  async function loadNotes() {
    setLoading(true);
    const r = await useFetch(`/notes/book/${userbook_id}`, { 
      headers: { ...authHeaders() } 
    });
    if (r.ok) {
      setNotes(r.data);
    }
    setLoading(false);
  }

  async function updateNote(noteId) {
    const r = await useFetch(`/notes/${noteId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({
        text: editedText,
        is_public: editedIsPublic
      })
    });

    if (r.ok) {
      setMsg('Note updated');
      loadNotes();
      setEditingNote(null);
    } else {
      setMsg('Error: ' + (r.data.detail || JSON.stringify(r.data)));
    }
  }

  async function deleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    const r = await useFetch(`/notes/${noteId}`, {
      method: 'DELETE',
      headers: { ...authHeaders() }
    });

    if (r.ok) {
      setMsg('Note deleted');
      loadNotes();
    } else {
      setMsg('Error: ' + (r.data.detail || JSON.stringify(r.data)));
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString();
  }

  if (loading) return <div>Loading notes...</div>;

  return (
    <div style={{marginTop: '20px'}}>
      <h4 style={{marginBottom: '12px'}}>Notes</h4>
      {notes.length === 0 && <div style={{color: '#666'}}>No notes yet</div>}
      <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
        {notes.map(note => (
          <div key={note.id} style={{...styles.card, border: note.is_public ? '1px solid #e2e8f0' : '1px solid #edf2f7'}}>
            {editingNote === note.id ? (
              <div>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  style={styles.textarea}
                />
                <div style={{marginTop: '8px'}}>
                  <label style={{fontSize: '0.9em', color: '#4a5568'}}>
                    <input
                      type="checkbox"
                      checked={editedIsPublic}
                      onChange={(e) => setEditedIsPublic(e.target.checked)}
                      style={{marginRight: '4px'}}
                    />
                    Public note
                  </label>
                </div>
                <div style={{marginTop: '8px', display: 'flex', gap: '8px'}}>
                  <button onClick={() => updateNote(note.id)} style={styles.smallBtn}>Save</button>
                  <button onClick={() => setEditingNote(null)} style={{...styles.smallBtn, background: '#718096'}}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{fontSize: '0.9em'}}>{note.text}</div>
                <div style={{fontSize: '0.8em', color: '#718096', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span>
                    {formatDate(note.created_at)}
                    {note.is_public && <span style={{marginLeft: '8px', color: '#4299e1'}}>• Public</span>}
                  </span>
                  <div>
                    <button 
                      onClick={() => {
                        setEditingNote(note.id);
                        setEditedText(note.text);
                        setEditedIsPublic(note.is_public);
                      }} 
                      style={styles.iconBtn}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => deleteNote(note.id)} 
                      style={{...styles.iconBtn, color: '#e53e3e'}}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// CreatePost Component - Form for creating new posts in the feed
// Allows users to share thoughts about books with optional images and emojis
function CreatePost({ onPost }) {
  // Post content states
  const [text, setText] = useState('');                    // The main post text
  const [image, setImage] = useState(null);                // Selected image file
  const [imagePreview, setImagePreview] = useState(null);  // Preview of selected image
  const [isQuote, setIsQuote] = useState(false);          // Whether post is a quote
  
  // UI interaction states
  const [showEmojiPicker, setShowEmojiPicker] = useState(false); // Show/hide emoji picker
  const [loading, setLoading] = useState(false);                  // Loading state during post
  const [error, setError] = useState(null);                       // Error messages

  // Handle image selection and preview
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);  // Store the file for uploading
      // Create a preview URL for the selected image
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEmojiSelect = (emoji) => {
    setText(text + emoji);
    setShowEmojiPicker(false);
  };

  const clearForm = () => {
    setText('');
    setImage(null);
    setImagePreview(null);
    setIsQuote(false);
    setShowEmojiPicker(false);
    setSelectedBook(null);
    setShowBookSelect(false);
    setError(null);
  };

  const [selectedBook, setSelectedBook] = useState(null);
  const [userBooks, setUserBooks] = useState([]);
  const [showBookSelect, setShowBookSelect] = useState(false);

  // Fetch user's books when component mounts
  useEffect(() => {
    async function fetchUserBooks() {
      const r = await useFetch('/userbooks', {
        headers: { ...authHeaders() }
      });
      if (r.ok) {
        setUserBooks(r.data);
      }
    }
    fetchUserBooks();
  }, []);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    
    // Clear any previous errors
    setError(null);

    // If no book is selected, show book selector
    if (!selectedBook) {
      setShowBookSelect(true);
      return;
    }
    
    setLoading(true);

    try {
      const res = await useFetch('/notes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({
          userbook_id: selectedBook.id,
          text: isQuote ? `"${text}"` : text,
          is_public: true
        })
      });

      if (res.ok) {
        clearForm();
        onPost();
      } else {
        setError(res.data.detail || 'Failed to create post. Please try again.');
        console.error('Error response:', res.data);
      }
    } catch (error) {
      console.error('Error creating post:', error);
      setError('An error occurred while creating the post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.postCreator}>
      <div style={styles.postCreatorHeader}>
        <div style={styles.profileIcon}>
          <svg viewBox="0 0 24 24" style={{width: 24, height: 24, fill: '#fff'}}>
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <div style={{flex: 1}}>
          {selectedBook && (
            <div style={styles.selectedBook}>
              📚 {selectedBook.book.title}
              <button 
                onClick={() => setSelectedBook(null)}
                style={styles.removeBookBtn}
              >
                ×
              </button>
            </div>
          )}
          <textarea
            placeholder="What are you feeling from your read?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              ...styles.postInput,
              fontStyle: text ? 'normal' : 'italic',
              fontSize: text ? '0.95em' : '0.9em'
            }}
          />
          {imagePreview && (
            <div style={styles.imagePreview}>
              <img src={imagePreview} alt="Preview" style={{maxWidth: '100%', maxHeight: 200}} />
              <button 
                onClick={() => { setImage(null); setImagePreview(null); }}
                style={styles.removeImageBtn}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
      
      {showBookSelect && !selectedBook && (
        <div style={styles.bookSelector}>
          <h4 style={{margin: '0 0 8px 0', color: '#4a5568'}}>Select a book to post about:</h4>
          <div style={styles.bookList}>
            {userBooks.map(book => (
              <button
                key={book.id}
                onClick={() => {
                  setSelectedBook(book);
                  setShowBookSelect(false);
                }}
                style={styles.bookSelectBtn}
              >
                <strong>{book.book.title}</strong>
                <span style={{fontSize: '0.9em', color: '#718096'}}>{book.status}</span>
              </button>
            ))}
          </div>
          <button 
            onClick={() => setShowBookSelect(false)}
            style={styles.cancelBtn}
          >
            Cancel
          </button>
        </div>
      )}
      
      <div style={styles.postActions}>
        <div style={styles.postTools}>
          <label style={styles.postTool}>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{display: 'none'}}
            />
            <span role="img" aria-label="Add image">📷</span>
          </label>
          <button 
            onClick={() => setIsQuote(!isQuote)} 
            style={{...styles.postTool, color: isQuote ? '#2b6cb0' : '#4a5568'}}
          >
            "
          </button>
          <button 
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            style={styles.postTool}
          >
            😊
          </button>
          {showEmojiPicker && (
            <div style={styles.emojiPicker}>
              {["😊", "📚", "💭", "❤️", "👍", "🎉", "✨", "💡"].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiSelect(emoji)}
                  style={styles.emojiBtn}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button 
          onClick={handleSubmit}
          disabled={!text.trim() || loading}
          style={{
            ...styles.shareBtn,
            opacity: !text.trim() || loading ? 0.6 : 1
          }}
        >
          {loading ? 'Sharing...' : 'Share'}
        </button>
      </div>
    </div>
  );
}

// Feed Component - Shows the social feed of book-related posts
// Displays updates from users, including notes and reading progress
function Feed({ items = [] }){
  // Keep track of which page we're viewing
  const [currentPage, setCurrentPage] = useState(1);
  
  // Sort all posts by date, newest first
  // This ensures users always see the latest updates at the top
  const sortedItems = [...items].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );
  
  // Calculate pagination
  const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const displayedItems = sortedItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  function changePage(pageNum) {
    setCurrentPage(pageNum);
    window.scrollTo(0, 0);
  }

  const [error, setError] = useState(null);

  // Reset to first page when new items are added
  useEffect(() => {
    setCurrentPage(1);
  }, [items.length]);

  return (
    <div>
      <CreatePost onPost={() => setRefreshKey(k => k + 1)} />
      
      {error && (
        <div style={{...styles.alert, background: '#fed7d7', color: '#c53030', marginBottom: '16px'}}>
          {error}
        </div>
      )}
      
      {items.length === 0 && <div style={{marginTop: 16}}>No items in feed</div>}
      {items.length > 0 && (
        <div style={{color: '#666', margin: '16px 0'}}>
          Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, items.length)} of {items.length} items
        </div>
      )}
      
      {displayedItems.map(n => (
        <div key={n.id} style={styles.card}>
          {n.userbook && (
            <div style={{fontSize: '0.9em', color: '#2d3748', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px'}}>
              <span role="img" aria-label="book">📚</span>
              <strong>{n.userbook.book.title}</strong>
            </div>
          )}
          <div>{truncateText(n.text, 300)}</div>
          <div style={{fontSize: '0.85em', color: '#718096', marginTop: '8px'}}>
            {new Date(n.created_at).toLocaleString()}
          </div>
        </div>
      ))}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button 
            onClick={() => changePage(currentPage - 1)} 
            disabled={currentPage === 1}
            style={{...styles.pageBtn, opacity: currentPage === 1 ? 0.5 : 1}}
          >
            Previous
          </button>
          {Array.from({length: totalPages}, (_, i) => i + 1).map(num => (
            <button
              key={num}
              onClick={() => changePage(num)}
              style={{
                ...styles.pageBtn,
                ...(num === currentPage ? styles.activePageBtn : {})
              }}
            >
              {num}
            </button>
          ))}
          <button 
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={{...styles.pageBtn, opacity: currentPage === totalPages ? 0.5 : 1}}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function FollowPanel({ onMessage }){
  const [idToFollow, setIdToFollow] = useState('');
  async function follow(){
    const token = localStorage.getItem('bt_token');
    if(!token){ alert('Login first'); return; }
    const res = await fetch(BACKEND + '/follow/' + idToFollow, {method:'POST', headers:{ Authorization:`Bearer ${token}` }});
    const data = await res.json();
    if(res.ok) onMessage('Followed!'); else onMessage('Error: '+(data.detail||JSON.stringify(data)));
  }
  return (
    <div>
      <h3>Follow someone</h3>
      <div><input placeholder="User id to follow" value={idToFollow} onChange={e=>setIdToFollow(e.target.value)} style={styles.input}/></div>
      <button onClick={follow} style={styles.btn}>Follow</button>
    </div>
  );
}

// Helper function to shorten long text
// Used for book descriptions and long posts to keep the UI clean
// For example: "This is a very long text..." instead of showing the full text
function truncateText(text, maxLength = 100) {
  if (!text) return '';                              // Handle empty text
  if (text.length <= maxLength) return text;         // Text is short enough, show all
  return text.slice(0, maxLength).trim() + '...';    // Text is too long, cut it and add ...
}

// How many items (books, posts, etc.) to show per page
// This helps keep pages loading fast and prevents endless scrolling
const ITEMS_PER_PAGE = 6;

// Styles object - Contains all the visual styling for the app
// This defines how everything looks: colors, spacing, layout, etc.
const styles = {
  // Main app container style - Sets the overall look and feel
  app: { fontFamily: 'Segoe UI, Roboto, system-ui, sans-serif', minHeight:'100vh', background:'#f6f7fb' },
  postCreator: {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    marginBottom: '20px'
  },
  postCreatorHeader: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px'
  },
  profileIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: '#4a5568',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  postInput: {
    width: '100%',
    minHeight: '80px',
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    resize: 'none',
    color: '#2d3748',
    backgroundColor: '#f8fafc',
    transition: 'all 0.2s',
    outline: 'none',
    ':focus': {
      borderColor: '#4299e1',
      backgroundColor: '#fff'
    }
  },
  postActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #e2e8f0'
  },
  postTools: {
    display: 'flex',
    gap: '16px',
    position: 'relative'
  },
  postTool: {
    background: 'none',
    border: 'none',
    fontSize: '1.2em',
    color: '#4a5568',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s',
    ':hover': {
      background: '#f7fafc'
    }
  },
  shareBtn: {
    padding: '8px 16px',
    background: '#2b6cb0',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
    ':hover': {
      background: '#2c5282'
    }
  },
  imagePreview: {
    position: 'relative',
    marginTop: '12px',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  removeImageBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    ':hover': {
      background: 'rgba(0,0,0,0.7)'
    }
  },
  emojiPicker: {
    position: 'absolute',
    top: '100%',
    left: '0',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '8px',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '4px',
    marginTop: '4px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    zIndex: 10
  },
  emojiBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.2em',
    padding: '4px',
    cursor: 'pointer',
    borderRadius: '4px',
    ':hover': {
      background: '#f7fafc'
    }
  },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', background:'#fff', borderBottom:'1px solid #eee' },
  container: { display:'flex', gap:16, padding:20 },
  sidebar: { width:200, background:'#fff', padding:12, borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' },
  main: { flex:1 },
  link: { 
    marginLeft: 8, 
    padding: '6px 12px', 
    border: 'none', 
    background: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#4a5568',
    fontSize: '0.95em',
    transition: 'all 0.2s ease'
  },
  activeLink: {
    background: '#2b6cb0',
    color: 'white',
  },
  filterBtn: { display:'block', width:'100%', textAlign:'left', padding:'8px 12px', margin:'4px 0', borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:'#4a5568', fontSize:'0.95em', transition:'all 0.2s', 
    ':hover': { background:'#f7fafc' } },
  card: { background:'#fff', padding:12, borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.04)' },
  btn: { padding:'8px 12px', borderRadius:6, border:'none', background:'#2b6cb0', color:'#fff', cursor:'pointer' },
  smallBtn: { padding:'6px 8px', borderRadius:6, border:'none', background:'#4a5568', color:'#fff', marginRight:8, cursor:'pointer' },
  input: { width:'100%', padding:8, margin:'6px 0', borderRadius:6, border:'1px solid #ddd' },
  textarea: { width:'100%', padding:8, margin:'6px 0', minHeight:80, borderRadius:6, border:'1px solid #ddd' },
  alert: { background:'#fff8c4', padding:10, borderRadius:6, marginBottom:8 },
  iconBtn: { 
    padding: '4px 8px', 
    borderRadius: 4, 
    border: 'none', 
    background: 'transparent',
    color: '#4a5568',
    fontSize: '0.85em',
    cursor: 'pointer',
    marginLeft: '8px',
    ':hover': { 
      background: '#f7fafc' 
    }
  },
  statCard: {
    padding: '16px',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    textAlign: 'center'
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    marginTop: '20px'
  },
  pageBtn: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#4a5568',
    cursor: 'pointer',
    ':hover': {
      background: '#f7fafc'
    }
  },
  activePageBtn: {
    background: '#2b6cb0',
    color: '#fff',
    border: '1px solid #2b6cb0'
  }
};
