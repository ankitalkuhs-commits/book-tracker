// Book Detail Screen - Shows book details, progress, and notes
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { userbooksAPI, notesAPI } from '../services/api';
import { getStatusLabel, getStatusColor, calcProgressPercent } from '../utils/bookUtils';

export default function BookDetailScreen({ route, navigation }) {
  const { userbook, userbookId } = route.params || {};
  
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentStatus, setCurrentStatus] = useState(userbook?.status || 'to-read');
  const [currentPage, setCurrentPage] = useState(userbook?.current_page?.toString() || '0');
  const [updatingProgress, setUpdatingProgress] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNotePage, setNewNotePage] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (userbook) {
      loadNotes();
    } else {
      setLoading(false);
    }
  }, []);

  const loadNotes = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const bookNotes = await notesAPI.getNotesForBook(userbook.id);
      setNotes(bookNotes || []);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const updateProgress = async () => {
    setUpdatingProgress(true);
    try {
      await userbooksAPI.updateProgress(userbook.id, {
        current_page: parseInt(currentPage) || 0,
      });
      Alert.alert('Success', 'Progress updated!');
    } catch (error) {
      console.error('Error updating progress:', error);
      Alert.alert('Error', `Failed to update progress: ${error.message}`);
    } finally {
      setUpdatingProgress(false);
    }
  };

  const addNote = async () => {
    if (!newNoteText.trim()) {
      Alert.alert('Error', 'Please enter some text for your note');
      return;
    }

    setAddingNote(true);
    try {
      const noteData = {
        userbook_id: userbook.id,
        text: newNoteText.trim(),
        page_number: newNotePage ? parseInt(newNotePage) : null,
        is_public: false,
      };

      await notesAPI.createNote(noteData);
      
      // Reload notes (don't show loading spinner)
      await loadNotes(false);
      
      // Reset form
      setNewNoteText('');
      setNewNotePage('');
      setShowAddNote(false);
      
      Alert.alert('Success', 'Note added!');
    } catch (error) {
      console.error('Error adding note:', error);
      Alert.alert('Error', `Failed to add note: ${error.message}`);
    } finally {
      setAddingNote(false);
    }
  };

  const changeStatus = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const updateData = { status: newStatus };

      if (newStatus === 'finished') {
        const pages = userbook.book?.total_pages || userbook.current_page || 0;
        updateData.current_page = pages;
        setCurrentPage(pages.toString());
      }

      await userbooksAPI.updateProgress(userbook.id, updateData);

      // Update local state so UI re-renders correctly
      setCurrentStatus(newStatus);
      userbook.status = newStatus;

      Alert.alert('Success', `Status changed to ${getStatusLabel(newStatus)}!`);
    } catch (error) {
      console.error('Error changing status:', error);
      Alert.alert('Error', `Failed to change status: ${error.message}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRemoveBook = () => {
    Alert.alert(
      'Remove Book',
      'Remove this book from your library? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await userbooksAPI.deleteBook(userbook.id);
              navigation.goBack();
            } catch (error) {
              console.error('Error removing book:', error);
              Alert.alert('Error', 'Failed to remove book from library');
            }
          },
        },
      ]
    );
  };

  const progressPercent = calcProgressPercent(currentPage, userbook?.book?.total_pages);

  // Guard: if no userbook data, show error
  if (!userbook) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, color: '#666', marginBottom: 16 }}>Book not found</Text>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={{ backgroundColor: '#0066cc', padding: 12, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 60}
    >
      <ScrollView 
        style={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Book Info Card */}
        <View style={styles.bookCard}>
          <View style={styles.bookCoverContainer}>
            <Image
              source={{ uri: userbook.book?.cover_url || 'https://via.placeholder.com/150x225' }}
              style={styles.bookCover}
            />
          </View>
          
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle}>{userbook.book?.title || 'Untitled Book'}</Text>
            <Text style={styles.bookAuthor}>{userbook.book?.author || 'Unknown Author'}</Text>
            
            {userbook.book?.total_pages > 0 && (
              <Text style={styles.bookPages}>📖 {userbook.book.total_pages} pages</Text>
            )}
            
            {/* Status Selector */}
            <Text style={styles.statusLabel}>Status</Text>
            <View style={styles.statusButtons}>
              {['to-read', 'reading', 'finished'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusButton,
                    currentStatus === status && styles.statusButtonActive,
                    { borderColor: getStatusColor(status) },
                    currentStatus === status && { backgroundColor: getStatusColor(status) },
                  ]}
                  onPress={() => changeStatus(status)}
                  disabled={updatingStatus || currentStatus === status}
                >
                  <Text
                    style={[
                      styles.statusButtonText,
                      currentStatus === status && styles.statusButtonTextActive,
                    ]}
                  >
                    {getStatusLabel(status)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Progress Section */}
        {currentStatus === 'reading' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reading Progress</Text>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.progressText}>{progressPercent}% Complete</Text>
            </View>

            <View style={styles.updateProgress}>
              <Text style={styles.label}>Current Page:</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={currentPage}
                  onChangeText={setCurrentPage}
                  keyboardType="numeric"
                  placeholder="0"
                />
                <Text style={styles.totalPages}>/ {userbook.book?.total_pages ? userbook.book.total_pages : '?'}</Text>
                <TouchableOpacity
                  style={styles.updateButton}
                  onPress={updateProgress}
                  disabled={updatingProgress}
                >
                  {updatingProgress ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.updateButtonText}>Update</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Notes Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Notes ({notes.length})</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#4285F4" />
          ) : notes.length === 0 ? (
            <Text style={styles.emptyText}>No notes yet. Add your first note!</Text>
          ) : (
            notes.map((note) => (
              <View key={note.id} style={styles.noteCard}>
                <Text style={styles.noteText}>{note.text}</Text>
                {note.page_number && (
                  <Text style={styles.notePage}>Page {note.page_number}</Text>
                )}
                <Text style={styles.noteDate}>
                  {new Date(note.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))
          )}
          
          {showAddNote ? (
            <View style={styles.addNoteForm}>
              <TextInput
                style={styles.noteInput}
                placeholder="Write your note here..."
                value={newNoteText}
                onChangeText={setNewNoteText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <View style={styles.noteFormRow}>
                <TextInput
                  style={styles.pageInput}
                  placeholder="Page #"
                  value={newNotePage}
                  onChangeText={setNewNotePage}
                  keyboardType="numeric"
                />
                <View style={styles.noteFormButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowAddNote(false);
                      setNewNoteText('');
                      setNewNotePage('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveNoteButton}
                    onPress={addNote}
                    disabled={addingNote}
                  >
                    {addingNote ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.saveNoteButtonText}>Save Note</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.addNoteButton}
              onPress={() => setShowAddNote(true)}
            >
              <Text style={styles.addNoteButtonText}>+ Add Note</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Remove Book */}
        <View style={styles.removeSection}>
          <TouchableOpacity style={styles.removeButton} onPress={handleRemoveBook}>
            <Text style={styles.removeButtonText}>Remove from Library</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4285F4',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  bookCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 8,
    borderBottomColor: '#f5f5f5',
  },
  bookCoverContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  bookCover: {
    width: 140,
    height: 210,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  bookInfo: {
    flex: 1,
  },
  bookTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
    lineHeight: 28,
    textAlign: 'center',
  },
  bookAuthor: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  statusButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  statusButtonActive: {
    // backgroundColor set dynamically
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statusButtonTextActive: {
    color: '#fff',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    marginBottom: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bookPages: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  updateProgress: {
    marginTop: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    width: 80,
    color: '#333',
  },
  totalPages: {
    fontSize: 16,
    color: '#666',
    marginLeft: 10,
    marginRight: 15,
  },
  updateButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  noteCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#4285F4',
  },
  noteText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  notePage: {
    fontSize: 12,
    color: '#4285F4',
    marginBottom: 5,
  },
  noteDate: {
    fontSize: 11,
    color: '#999',
  },
  addNoteButton: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  addNoteButtonText: {
    fontSize: 14,
    color: '#4285F4',
    fontWeight: '600',
  },
  addNoteForm: {
    marginTop: 10,
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  noteInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 10,
    color: '#333',
  },
  noteFormRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  removeSection: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  removeButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e53e3e',
  },
  removeButtonText: {
    color: '#e53e3e',
    fontSize: 15,
    fontWeight: '600',
  },
  pageInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    width: 80,
    color: '#333',
  },
  noteFormButtons: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#666',
  },
  saveNoteButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveNoteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
