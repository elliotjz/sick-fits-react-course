import Link from 'next/link'

const Home = () => (
  <div>
    <h1>Home</h1>
    <Link href="/sell">
      <a>Sell</a>
    </Link>
  </div>
)

export default Home
