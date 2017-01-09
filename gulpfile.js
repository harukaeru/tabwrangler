const gulp = require('gulp');
const babel = require('gulp-babel');

gulp.task('cp', function() {
  gulp.src([
      'app/**/!(*.js)',
      'MIT-LICENSE.txt',
      'README.md',
    ])
    .pipe(gulp.dest('dist'));
});

gulp.task('cp-lib', function() {
  gulp.src('app/lib/**')
    .pipe(gulp.dest('dist/lib'));
});

gulp.task('js', function() {
  var presets = ['es2015', 'react'];

  gulp.src('app/*.js')
    .pipe(babel({
      presets: presets,
    }))
    .pipe(gulp.dest('dist'));

  gulp.src('app/js/*.js')
    .pipe(babel({
      presets: presets,
    }))
    .pipe(gulp.dest('dist/js'));
});

gulp.task('default', ['cp', 'cp-lib', 'js']);
