import React,{useEffect,useState} from "react"
import {fetchPosts,fetchFollowersReading,fetchHighlights} from "../services/mockApi"
import PostComposer from "../components/bookpulse/PostComposer"
import PulseCard from "../components/bookpulse/PulseCard"
import FollowersReading from "../components/bookpulse/FollowersReading"
import CommunityHighlights from "../components/bookpulse/CommunityHighlights"

export default function BPFeed(){
  const [posts,setPosts]=useState([])
  const [followers,setFollowers]=useState([])
  const [highlights,setHighlights]=useState({})
  useEffect(()=>{
    fetchPosts().then(setPosts)
    fetchFollowersReading().then(setFollowers)
    fetchHighlights().then(setHighlights)
  },[])
  const addPost=p=>setPosts(prev=>[{...p,id:Date.now(),user:{name:'You'}},...prev])
  return(
    <div className="max-w-6xl mx-auto flex gap-6 p-4">
      <div className="flex-1">
        <PostComposer onPost={addPost}/>
        <h2 className="text-xl font-semibold mb-3">Community Pulse</h2>
        {posts.map(p=><PulseCard key={p.id} post={p}/>)}
      </div>
      <aside className="w-80">
        <FollowersReading list={followers}/>
        <CommunityHighlights data={highlights}/>
      </aside>
    </div>
  )
}
