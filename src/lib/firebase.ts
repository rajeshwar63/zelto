import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyCr636d3rLRBYV2Dyz9_mhI8xDW85BYfUk",
  authDomain: "zelto-87b9f.firebaseapp.com",
  projectId: "zelto-87b9f",
  storageBucket: "zelto-87b9f.firebasestorage.app",
  messagingSenderId: "1087219191711",
  appId: "1:1087219191711:web:bbb8174f38aeb3643077aa"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
