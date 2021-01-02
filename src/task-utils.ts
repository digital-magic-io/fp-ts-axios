import { pipe } from 'fp-ts/lib/pipeable'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import { sequenceT } from 'fp-ts/lib/Apply'
import { TaskEitherError } from './types'

export const completeHandler = <Left, Right>(
  success: (s: Right) => void,
  failure: (f: Left) => void
): ((task: TE.TaskEither<Left, Right>) => void) => (task) => {
  task().then((r) => pipe(r, E.fold(failure, success)))
}

export const onComplete = <Left, Right>(
  task: TE.TaskEither<Left, Right>,
  success: (s: Right) => void,
  failure: (f: Left) => void
): void => completeHandler(success, failure)(task)

export const finallyHandler = <Left, Right>(
  fn: () => void
): ((task: TE.TaskEither<Left, Right>) => TE.TaskEither<Left, Right>) => (task) =>
  pipe(
    task,
    TE.map((r) => {
      fn()
      return r
    }),
    TE.mapLeft((l) => {
      fn()
      return l
    })
  )

export const toPromise = <T>(task: TaskEitherError<T>): Promise<T> =>
  task().then((res) =>
    pipe(
      res,
      E.fold(
        (e) => Promise.reject(e),
        (r) => Promise.resolve(r)
      )
    )
  )

export const sequenceTasks = <T1, T2>(
  t1: TaskEitherError<T1>,
  t2: TaskEitherError<T2>
): TaskEitherError<readonly [T1, T2]> => sequenceT(TE.taskEither)(t1, t2)

export const sequence3Tasks = <T1, T2, T3>(
  t1: TaskEitherError<T1>,
  t2: TaskEitherError<T2>,
  t3: TaskEitherError<T3>
): TaskEitherError<readonly [T1, T2, T3]> => sequenceT(TE.taskEither)(t1, t2, t3)

export const chainTasks = <T1, T2>(t1: TaskEitherError<T1>, t2: (v: T1) => TaskEitherError<T2>): TaskEitherError<T2> =>
  pipe(t1, TE.chain(t2))
