function Person(name, foods) {
  this.name = name
  this.foods = foods
}

Person.prototype.fetchFavFoods = function() {
  return new Promise((resolve, reject) => {
    // Simulate API
    setTimeout(() => resolve(this.foods), 2000)
  })
}

describe('mocking learning', () => {
  it('mocks a reg function', () => {
    const fetchDogs = jest.fn()
    fetchDogs('snickers')
    expect(fetchDogs).toHaveBeenCalled()
    expect(fetchDogs).toHaveBeenCalledWith('snickers')

    fetchDogs('hugo')
    expect(fetchDogs).toHaveBeenCalledTimes(2)
  })

  it('Can create a person', () => {
    const me = new Person('Elliot', ['Curry', 'Tacos'])
    expect(me.name).toBe('Elliot')
  })

  it('Can fetch foods', async () => {
    const me = new Person('Elliot', ['Curry', 'Tacos'])
    // Mock the favFoods function
    me.fetchFavFoods = jest.fn().mockResolvedValue(['sushi', 'pizza'])
    const favFoods = await me.fetchFavFoods()
    expect(favFoods).toContain('pizza')
  })
})
