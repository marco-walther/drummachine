/** Four corner brackets. Place inside an element with the `bracket-frame` class. */
export function Brackets() {
  return (
    <>
      <span className="bracket bracket-tl" aria-hidden="true" />
      <span className="bracket bracket-tr" aria-hidden="true" />
      <span className="bracket bracket-bl" aria-hidden="true" />
      <span className="bracket bracket-br" aria-hidden="true" />
    </>
  )
}
